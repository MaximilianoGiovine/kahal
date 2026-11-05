export type ProviderSlug = 'google' | 'apple';

export interface PendingIdentity {
  provider: 'GOOGLE' | 'APPLE';
  email: string;
  firstName?: string;
  lastName?: string;
}

const MESSAGES: Record<string, string> = {
  cancelled: 'Cancelaste el ingreso. Puedes volver a intentarlo cuando quieras.',
  invalid_state: 'El ingreso tardó demasiado o se abrió en otro navegador. Vuelve a intentarlo.',
  provider_error: 'No se pudo completar el ingreso con esa cuenta. Vuelve a intentarlo en unos minutos.',
  unavailable: 'Esta opción de ingreso no está disponible.',
  email_exists: 'Ya existe una cuenta con ese email. Ingresa con tu contraseña y conéctala desde Mi perfil.',
  email_unverified: 'Esa cuenta no tiene el email verificado. Verifícalo e intenta de nuevo.',
  no_email: 'Esa cuenta no compartió un email, y Kahal lo necesita para crear tu cuenta.',
  blocked: 'Tu cuenta o tu iglesia están deshabilitadas en Kahal.',
  already_linked: 'Esa cuenta ya está conectada a otro usuario, o ya conectaste una de ese proveedor.',
};

export function oauthErrorMessage(code: string | null) {
  if (!code) return null;
  return MESSAGES[code] ?? MESSAGES.provider_error;
}
