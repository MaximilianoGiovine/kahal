import { ArrayUnique, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { UserStatus } from '@prisma/client';
import { PageQuery } from '../common/pagination';

export class UsersQuery extends PageQuery {
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsString() roleId?: string;
}

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(60) firstName: string;
  @IsString() @MinLength(2) @MaxLength(60) lastName: string;
  @IsEmail({}, { message: 'Email inválido' }) email: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) password: string;
  @IsArray() @ArrayUnique() @IsString({ each: true }) roleIds: string[];
  /** Limita sus miembros y finanzas a `campusIds`. */
  @IsOptional() @IsBoolean() campusRestricted?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) campusIds?: string[];
}

export class UpdateUserDto {
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) roleIds?: string[];
  @IsOptional() @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED]) status?: UserStatus;
  @IsOptional() @IsBoolean() campusRestricted?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) campusIds?: string[];
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  // Datos de la ficha de miembro (los mismos que se piden al registrarse).
  @IsOptional() @IsString() @MaxLength(30) documentId?: string;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsBoolean() baptized?: boolean;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
}
