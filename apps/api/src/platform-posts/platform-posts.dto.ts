import { PlatformPostKind } from '@prisma/client';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PLATFORM_FOLDER } from '../files/storage.service';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class PlatformPostDto {
  @IsEnum(PlatformPostKind) kind: PlatformPostKind;
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(500) summary?: string | null;
  /** HTML del editor; se sanea en el servidor. */
  @IsString() @MinLength(1) @MaxLength(500_000) body: string;
  /** Solo imágenes de la carpeta de Kahal: las de una iglesia no las pueden ver las demás. */
  @IsOptional()
  @Transform(emptyToNull)
  @IsString()
  @Matches(new RegExp(`^${PLATFORM_FOLDER}/image/`), { message: 'Imagen de portada inválida' })
  coverKey?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @Transform(emptyToNull) @IsDateString({}, { message: 'Fecha de vencimiento inválida' }) expiresAt?: string | null;
}

export class PlatformPostsQuery {
  /** Máximo de noticias a devolver (los avisos vigentes van siempre). */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 6;
}
