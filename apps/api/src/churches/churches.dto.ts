import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsHexColor,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  ValidateIf,
  IsTimeZone,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Currency } from '@prisma/client';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);
const CHANNEL_URL = { protocols: ['https'], require_protocol: true };

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
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsUrl(CHANNEL_URL, { message: 'Enlace de YouTube inválido' }) youtubeUrl?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsUrl(CHANNEL_URL, { message: 'Enlace de Facebook inválido' }) facebookUrl?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsUrl(CHANNEL_URL, { message: 'Enlace de Twitch inválido' }) twitchUrl?: string | null;
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

  @IsTimeZone({ message: 'Elige una zona horaria válida' }) timezone: string;

  @IsEnum(Currency, { message: 'Elige una moneda válida' }) currency: Currency;

  @ValidateNested()
  @Type(() => ChurchAdminDto)
  admin: ChurchAdminDto;
}

export class AdminUpdateChurchDto extends UpdateChurchDto {
  @IsOptional() @IsBoolean() active?: boolean;
}
