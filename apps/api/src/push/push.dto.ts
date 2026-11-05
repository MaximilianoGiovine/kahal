import { Type } from 'class-transformer';
import { IsString, Matches, MaxLength, Validate, ValidateNested, ValidatorConstraint, ValidatorConstraintInterface } from 'class-validator';

const BASE64URL = /^[A-Za-z0-9_-]+=*$/;

/** Solo servicios de push de los navegadores: la API le hace pedidos a esta URL, que viene del cliente. */
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^android\.googleapis\.com$/, /(^|\.)push\.apple\.com$/, /(^|\.)push\.services\.mozilla\.com$/, /\.notify\.windows\.com$/];

@ValidatorConstraint({ name: 'pushEndpoint' })
export class IsPushEndpoint implements ValidatorConstraintInterface {
  validate(value: unknown) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' && !url.port && !url.username && PUSH_HOSTS.some((host) => host.test(url.hostname));
    } catch {
      return false;
    }
  }

  defaultMessage() {
    return 'Servicio de notificaciones no admitido';
  }
}

class PushKeysDto {
  @IsString() @Matches(BASE64URL) @MaxLength(200) p256dh: string;
  @IsString() @Matches(BASE64URL) @MaxLength(100) auth: string;
}

export class SubscribeDto {
  @IsString() @MaxLength(1024) @Validate(IsPushEndpoint) endpoint: string;

  @ValidateNested() @Type(() => PushKeysDto) keys: PushKeysDto;
}

export class UnsubscribeDto {
  @IsString() @MaxLength(1024) endpoint: string;
}
