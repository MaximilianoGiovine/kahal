import { ArrayUnique, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { Permission } from '@prisma/client';

export class RoleDto {
  @IsString() @MinLength(2) @MaxLength(40) name: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsArray() @ArrayUnique() @IsEnum(Permission, { each: true }) permissions: Permission[];
}
