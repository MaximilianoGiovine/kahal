import { Equals, IsBoolean, IsDateString, IsEmail, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @MinLength(1)
  password: string;
}

export class RegisterDto {
  @IsString()
  churchSlug: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  firstName: string;

  @IsString()
  @MinLength(2)
  @MaxLength(60)
  lastName: string;

  @IsEmail({}, { message: 'Email inválido' })
  email: string;

  @IsString()
  @MinLength(6, { message: 'Ingresa un teléfono válido' })
  @MaxLength(40)
  phone: string;

  @IsString()
  @MinLength(4, { message: 'Ingresa un número de documento válido' })
  @MaxLength(30)
  documentId: string;

  @IsDateString({}, { message: 'Fecha de nacimiento inválida' })
  birthDate: string;

  @IsBoolean({ message: 'Indica si estás bautizado/a' })
  baptized: boolean;

  @IsString()
  @MinLength(4, { message: 'Ingresa tu dirección' })
  @MaxLength(200)
  address: string;

  /** Se omite al registrarse con Google o Apple. */
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  password?: string;

  @Equals(true, { message: 'Debes aceptar el tratamiento de tus datos personales' })
  consent: boolean;
}

export class EmailQuery {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;
}

export class ChangePasswordDto {
  /** No hace falta si la cuenta (creada con Google o Apple) todavía no tiene contraseña. */
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  newPassword: string;
}
