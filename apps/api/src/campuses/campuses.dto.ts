import { Transform } from 'class-transformer';
import { CampusAspect } from '@prisma/client';
import { ArrayUnique, IsArray, IsBoolean, IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class CampusDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(120) city?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) address?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CampusSettingsDto {
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsArray() @ArrayUnique() @IsEnum(CampusAspect, { each: true }) separated?: CampusAspect[];
}
