import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuthProvider, Prisma, UserStatus } from '@prisma/client';
import { createRemoteJWKSet, importPKCS8, JWTPayload, jwtVerify, SignJWT } from 'jose';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService, VerifiedIdentity } from './auth.service';

export type ProviderSlug = 'google' | 'apple';

export const PROVIDER_KEYS: Record<ProviderSlug, AuthProvider> = { google: AuthProvider.GOOGLE, apple: AuthProvider.APPLE };

export const OAUTH_ENDPOINTS: Record<ProviderSlug, { authorize: string; token: string; jwks: string; issuers: string[] }> = {
  google: {
    authorize: 'https://accounts.google.com/o/oauth2/v2/auth',
    token: 'https://oauth2.googleapis.com/token',
    jwks: 'https://www.googleapis.com/oauth2/v3/certs',
    issuers: ['https://accounts.google.com', 'accounts.google.com'],
  },
  apple: {
    authorize: 'https://appleid.apple.com/auth/authorize',
    token: 'https://appleid.apple.com/auth/token',
    jwks: 'https://appleid.apple.com/auth/keys',
    issuers: ['https://appleid.apple.com'],
  },
};

export const STATE_TTL_SECONDS = 10 * 60;
export const PENDING_TTL_SECONDS = 30 * 60;

/** Fallo esperable del flujo. El código viaja a la web, que lo traduce a un mensaje. */
export class OAuthFlowError extends Error {
  constructor(public readonly code: string) {
    super(code);
  }
}

export interface OAuthState {
  provider: ProviderSlug;
  state: string;
  nonce: string;
  /** Presente cuando el flujo conecta la cuenta a una sesión ya iniciada. */
  linkUserId?: string;
  next?: string;
  iglesia?: string;
}

export interface PendingIdentity extends VerifiedIdentity {
  firstName?: string;
  lastName?: string;
}

interface Profile {
  subject: string;
  email?: string;
  emailVerified: boolean;
  firstName?: string;
  lastName?: string;
}

export type OAuthOutcome =
  | { kind: 'session'; tokens: Awaited<ReturnType<AuthService['startSession']>> }
  | { kind: 'register'; pending: string }
  | { kind: 'linked' };

@Injectable()
export class OAuthService {
  private readonly logger = new Logger(OAuthService.name);
  private readonly stateSecret: string;
  private readonly pendingSecret: string;
  private readonly jwks = new Map<ProviderSlug, ReturnType<typeof createRemoteJWKSet>>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {
    const secret = config.getOrThrow<string>('JWT_SECRET');
    this.stateSecret = `${secret}:oauth-state`;
    this.pendingSecret = `${secret}:oauth-pending`;
  }

  /** Un proveedor sin credenciales queda apagado y la web no muestra su botón. */
  isEnabled(provider: ProviderSlug) {
    const keys = provider === 'google' ? ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] : ['APPLE_CLIENT_ID', 'APPLE_TEAM_ID', 'APPLE_KEY_ID', 'APPLE_PRIVATE_KEY'];
    return keys.every((k) => !!this.config.get<string>(k));
  }

  /** Arma la redirección al proveedor y el estado firmado que queda en la cookie de este navegador. */
  async begin(provider: ProviderSlug, callbackUrl: string, opts: Pick<OAuthState, 'linkUserId' | 'next' | 'iglesia'>) {
    const state: OAuthState = { provider, state: randomBytes(24).toString('base64url'), nonce: randomBytes(24).toString('base64url'), ...opts };
    const params = new URLSearchParams({
      client_id: this.clientId(provider),
      redirect_uri: callbackUrl,
      response_type: 'code',
      state: state.state,
      nonce: state.nonce,
      ...(provider === 'google'
        ? { scope: 'openid email profile', prompt: 'select_account' }
        : // Apple exige form_post para entregar nombre y email.
          { scope: 'name email', response_mode: 'form_post' }),
    });
    return {
      url: `${OAUTH_ENDPOINTS[provider].authorize}?${params}`,
      cookie: await this.jwt.signAsync(state, { secret: this.stateSecret, expiresIn: STATE_TTL_SECONDS }),
    };
  }

  /** Lee el estado de la cookie sin validarlo contra la respuesta: sirve para saber a dónde volver si algo falla. */
  async readState(cookie: string | undefined): Promise<OAuthState | null> {
    if (!cookie) return null;
    return this.jwt.verifyAsync<OAuthState>(cookie, { secret: this.stateSecret }).catch(() => null);
  }

  async complete(
    provider: ProviderSlug,
    state: OAuthState,
    callbackUrl: string,
    response: { code?: string; state?: string; error?: string; user?: string },
  ): Promise<OAuthOutcome> {
    // El state ata la respuesta al navegador que inició el flujo: evita que alguien inicie sesión a otro con su cuenta.
    if (state.provider !== provider || !response.state || response.state !== state.state) throw new OAuthFlowError('invalid_state');
    if (response.error) throw new OAuthFlowError(['access_denied', 'user_cancelled_authorize'].includes(response.error) ? 'cancelled' : 'provider_error');
    if (!response.code) throw new OAuthFlowError('provider_error');

    const profile = await this.fetchProfile(provider, response.code, callbackUrl, state.nonce, response.user);
    return state.linkUserId ? this.link(provider, profile, state.linkUserId) : this.signIn(provider, profile);
  }

  async readPendingIdentity(cookie: string | undefined): Promise<PendingIdentity | null> {
    if (!cookie) return null;
    const pending = await this.jwt.verifyAsync<PendingIdentity>(cookie, { secret: this.pendingSecret }).catch(() => null);
    if (!pending) return null;
    return { provider: pending.provider, subject: pending.subject, email: pending.email, firstName: pending.firstName, lastName: pending.lastName };
  }

  private async signIn(provider: ProviderSlug, profile: Profile): Promise<OAuthOutcome> {
    const key = PROVIDER_KEYS[provider];
    const identity = await this.prisma.userIdentity.findUnique({
      where: { provider_subject: { provider: key, subject: profile.subject } },
      include: { user: { include: { church: { select: { active: true } } } } },
    });
    if (identity) {
      try {
        return { kind: 'session', tokens: await this.auth.startSession(identity.user) };
      } catch (err) {
        if (err instanceof ForbiddenException) throw new OAuthFlowError('blocked');
        throw err;
      }
    }

    if (!profile.email) throw new OAuthFlowError('no_email');
    if (!profile.emailVerified) throw new OAuthFlowError('email_unverified');
    const email = profile.email.toLowerCase().trim();
    // No se conecta sola a una cuenta existente: el registro no verifica el email, así que alguien pudo haberla
    // creado con la dirección de otra persona y conservaría el acceso. Se conecta desde Mi perfil, con sesión iniciada.
    if (await this.prisma.user.findUnique({ where: { email }, select: { id: true } })) throw new OAuthFlowError('email_exists');

    const pending: PendingIdentity = { provider: key, subject: profile.subject, email, firstName: profile.firstName, lastName: profile.lastName };
    return { kind: 'register', pending: await this.jwt.signAsync(pending, { secret: this.pendingSecret, expiresIn: PENDING_TTL_SECONDS }) };
  }

  private async link(provider: ProviderSlug, profile: Profile, userId: string): Promise<OAuthOutcome> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { status: true } });
    if (user?.status !== UserStatus.ACTIVE) throw new OAuthFlowError('blocked');
    try {
      await this.prisma.userIdentity.create({
        data: { userId, provider: PROVIDER_KEYS[provider], subject: profile.subject, email: profile.email?.toLowerCase().trim() },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') throw new OAuthFlowError('already_linked');
      throw err;
    }
    return { kind: 'linked' };
  }

  private async fetchProfile(provider: ProviderSlug, code: string, callbackUrl: string, nonce: string, appleUser?: string): Promise<Profile> {
    let claims: JWTPayload & Record<string, unknown>;
    try {
      const idToken = await this.exchangeCode(provider, code, callbackUrl);
      const { payload } = await jwtVerify(idToken, this.keySet(provider), {
        issuer: OAUTH_ENDPOINTS[provider].issuers,
        audience: this.clientId(provider),
      });
      claims = payload;
    } catch (err) {
      this.logger.warn(`Fallo al validar la respuesta de ${provider}: ${err instanceof Error ? err.message : err}`);
      throw new OAuthFlowError('provider_error');
    }
    if (claims.nonce !== nonce || !claims.sub) {
      this.logger.warn(`Token de ${provider} con nonce o sub inválido`);
      throw new OAuthFlowError('provider_error');
    }

    const profile: Profile = {
      subject: claims.sub,
      email: typeof claims.email === 'string' ? claims.email : undefined,
      // Apple lo informa como texto ("true").
      emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    };
    if (provider === 'google') {
      profile.firstName = typeof claims.given_name === 'string' ? claims.given_name : undefined;
      profile.lastName = typeof claims.family_name === 'string' ? claims.family_name : undefined;
    } else if (appleUser) {
      // Apple manda el nombre aparte y solo la primera vez. Se usa nada más para precompletar el registro.
      try {
        const { name } = JSON.parse(appleUser) as { name?: { firstName?: unknown; lastName?: unknown } };
        if (typeof name?.firstName === 'string') profile.firstName = name.firstName;
        if (typeof name?.lastName === 'string') profile.lastName = name.lastName;
      } catch {
        /* sin nombre: la persona lo escribe en el registro */
      }
    }
    return profile;
  }

  private async exchangeCode(provider: ProviderSlug, code: string, callbackUrl: string) {
    const res = await fetch(OAUTH_ENDPOINTS[provider].token, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: callbackUrl,
        client_id: this.clientId(provider),
        client_secret: provider === 'google' ? this.config.getOrThrow<string>('GOOGLE_CLIENT_SECRET') : await this.appleClientSecret(),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { id_token?: string; error?: string };
    if (!res.ok || !data.id_token) throw new Error(`token endpoint ${res.status}: ${data.error ?? 'sin id_token'}`);
    return data.id_token;
  }

  /** Apple no da un secreto fijo: se firma uno de corta duración con la clave privada. */
  private async appleClientSecret() {
    const pem = this.config.getOrThrow<string>('APPLE_PRIVATE_KEY').replace(/\\n/g, '\n');
    return new SignJWT({})
      .setProtectedHeader({ alg: 'ES256', kid: this.config.getOrThrow<string>('APPLE_KEY_ID') })
      .setIssuer(this.config.getOrThrow<string>('APPLE_TEAM_ID'))
      .setSubject(this.config.getOrThrow<string>('APPLE_CLIENT_ID'))
      .setAudience('https://appleid.apple.com')
      .setIssuedAt()
      .setExpirationTime('5m')
      .sign(await importPKCS8(pem, 'ES256'));
  }

  private clientId(provider: ProviderSlug) {
    return this.config.getOrThrow<string>(provider === 'google' ? 'GOOGLE_CLIENT_ID' : 'APPLE_CLIENT_ID');
  }

  private keySet(provider: ProviderSlug) {
    let set = this.jwks.get(provider);
    if (!set) {
      set = createRemoteJWKSet(new URL(OAUTH_ENDPOINTS[provider].jwks));
      this.jwks.set(provider, set);
    }
    return set;
  }
}
