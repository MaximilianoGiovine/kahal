import { Transform } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsHexColor,
  IsIn,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Gender } from '@prisma/client';
import { PageQuery } from '../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class MembersQuery extends PageQuery {
  @IsOptional() @IsString() statusId?: string;
  @IsOptional() @IsString() ministryId?: string;
  @IsOptional() @IsString() familyId?: string;
  /** Id de una sede, o `none` para quienes no tienen ninguna. */
  @IsOptional() @IsString() campusId?: string;
  /** app: se registró (tiene cuenta) · manual: cargado por la iglesia. */
  @IsOptional() @IsIn(['app', 'manual']) source?: 'app' | 'manual';
}

export class MemberDto {
  @IsString() @MinLength(1) @MaxLength(60) firstName: string;
  @IsString() @MinLength(1) @MaxLength(60) lastName: string;

  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsEmail({}, { message: 'Email inválido' })
  email?: string | null;

  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(40) phone?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(30) documentId?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() birthDate?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsEnum(Gender) gender?: Gender | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) address?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() joinedAt?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() baptismDate?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsBoolean() baptized?: boolean | null;
  @IsOptional() @Transform(emptyToNull) @IsString() familyId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() campusId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(40) familyRole?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() photoKey?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true }) ministryIds?: string[];
  @IsOptional() @IsArray() @ArrayUnique() @IsString({ each: true }) statusIds?: string[];
}

export class FamilyDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
}

export class MinistryDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(emptyToNull) @IsString() leaderId?: string | null;
}

export class MemberStatusDto {
  @IsString() @MinLength(2) @MaxLength(40) name: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) description?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsHexColor() color?: string | null;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() inactive?: boolean;
}

export class ReorderDto {
  @IsArray() @ArrayUnique() @IsString({ each: true }) ids: string[];
}
