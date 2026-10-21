import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Currency } from '@prisma/client';

export class UpdateChurchDto {
  @IsOptional() @IsString() @MinLength(2) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsString() @MaxLength(120) city?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
  @IsOptional() @IsString() @MaxLength(40) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsHexColor() primaryColor?: string;
  @IsOptional() @IsString() timezone?: string;
  @IsOptional() @IsEnum(Currency) defaultCurrency?: Currency;
  @IsOptional() @IsString() logoKey?: string;
}

class ChurchAdminDto {
  @IsString() @MinLength(2) firstName: string;
  @IsString() @MinLength(2) lastName: string;
  @IsEmail() email: string;
  @IsString() @MinLength(8) password: string;
}

export class CreateChurchDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;

  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, { message: 'El identificador solo admite minúsculas, números y guiones' })
  @MaxLength(60)
  slug: string;

  @IsOptional() @IsString() @MaxLength(120) city?: string;

  @ValidateNested()
  @Type(() => ChurchAdminDto)
  admin: ChurchAdminDto;
}

export class AdminUpdateChurchDto extends UpdateChurchDto {
  @IsOptional() @IsBoolean() active?: boolean;
}
