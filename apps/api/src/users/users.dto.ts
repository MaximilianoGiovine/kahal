import { IsEmail, IsEnum, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Role, UserStatus } from '@prisma/client';
import { PageQuery } from '../common/pagination';

const ASSIGNABLE_ROLES = [Role.ADMIN, Role.TREASURER, Role.PASTOR, Role.SECRETARY, Role.MEMBER];

export class UsersQuery extends PageQuery {
  @IsOptional() @IsEnum(UserStatus) status?: UserStatus;
  @IsOptional() @IsEnum(Role) role?: Role;
}

export class CreateUserDto {
  @IsString() @MinLength(2) @MaxLength(60) firstName: string;
  @IsString() @MinLength(2) @MaxLength(60) lastName: string;
  @IsEmail({}, { message: 'Email inválido' }) email: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsString() @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' }) password: string;
  @IsIn(ASSIGNABLE_ROLES) role: Role;
}

export class UpdateUserDto {
  @IsOptional() @IsIn(ASSIGNABLE_ROLES) role?: Role;
  @IsOptional() @IsIn([UserStatus.ACTIVE, UserStatus.DISABLED]) status?: UserStatus;
}

export class UpdateProfileDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) firstName?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(60) lastName?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
}
