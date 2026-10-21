import { Transform } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { Gender, MemberStatus } from '@prisma/client';
import { PageQuery } from '../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class MembersQuery extends PageQuery {
  @IsOptional() @IsEnum(MemberStatus) status?: MemberStatus;
  @IsOptional() @IsString() ministryId?: string;
  @IsOptional() @IsString() familyId?: string;
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
  @IsOptional() @IsEnum(MemberStatus) status?: MemberStatus;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() joinedAt?: string | null;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() baptismDate?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() familyId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(40) familyRole?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) notes?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() photoKey?: string | null;

  @IsOptional() @IsArray() @IsString({ each: true }) ministryIds?: string[];
}

export class FamilyDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
}

export class MinistryDto {
  @IsString() @MinLength(2) @MaxLength(80) name: string;
  @IsOptional() @IsString() @MaxLength(500) description?: string;
  @IsOptional() @Transform(emptyToNull) @IsString() leaderId?: string | null;
}
