import { Transform } from 'class-transformer';
import { Equals, IsEmail, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const trimToUndefined = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() || undefined : value);
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SLUG_MESSAGE = 'El identificador solo admite minúsculas, números y guiones';

export class SubmitChurchRequestDto {
  @Transform(trim) @IsString() @MinLength(2, { message: 'Ingresa el nombre de la iglesia' }) @MaxLength(120) name: string;

  @Matches(SLUG, { message: SLUG_MESSAGE }) @MaxLength(60) slug: string;

  @IsOptional() @Transform(trimToUndefined) @IsString() @MaxLength(120) city?: string;

  @IsOptional() @Transform(trimToUndefined) @IsString() @MaxLength(1000) message?: string;

  @Transform(trim) @IsString() @MinLength(2, { message: 'Ingresa tu nombre' }) @MaxLength(60) firstName: string;

  @Transform(trim) @IsString() @MinLength(2, { message: 'Ingresa tu apellido' }) @MaxLength(60) lastName: string;

  @IsEmail({}, { message: 'Email inválido' }) email: string;

  @Transform(trim) @IsString() @MinLength(6, { message: 'Ingresa un teléfono válido' }) @MaxLength(40) phone: string;

  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) @MaxLength(100) password: string;

  @Equals(true, { message: 'Debes aceptar el tratamiento de tus datos personales' }) consent: boolean;
}

export class ApproveChurchRequestDto {
  /** Permite corregir el identificador si el pedido llegó con uno que ya está en uso. */
  @IsOptional() @Matches(SLUG, { message: SLUG_MESSAGE }) @MaxLength(60) slug?: string;
}

export class RejectChurchRequestDto {
  @IsOptional() @Transform(trimToUndefined) @IsString() @MaxLength(500) reason?: string;
}
