import { Equals, IsBoolean, IsDateString, IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

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
  @MinLength(6, { message: 'Ingresá un teléfono válido' })
  @MaxLength(40)
  phone: string;

  @IsString()
  @MinLength(4, { message: 'Ingresá un número de carnet válido' })
  @MaxLength(30)
  documentId: string;

  @IsDateString({}, { message: 'Fecha de nacimiento inválida' })
  birthDate: string;

  @IsBoolean({ message: 'Indicá si estás bautizado/a' })
  baptized: boolean;

  @IsString()
  @MinLength(4, { message: 'Ingresá tu dirección' })
  @MaxLength(200)
  address: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  password: string;

  @Equals(true, { message: 'Debés aceptar el tratamiento de tus datos personales' })
  consent: boolean;
}

export class EmailQuery {
  @IsEmail({}, { message: 'Email inválido' })
  email: string;
}

export class ChangePasswordDto {
  @IsString()
  currentPassword: string;

  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  @MaxLength(100)
  newPassword: string;
}
