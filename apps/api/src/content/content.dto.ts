import { Transform } from 'class-transformer';
import { IsBoolean, IsDateString, IsOptional, IsString, IsUrl, MaxLength, MinLength, ValidateIf } from 'class-validator';

import { PageQuery } from '../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class AnnouncementDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsString() @MinLength(1) @MaxLength(10000) body: string;
  @IsOptional() @Transform(emptyToNull) @IsString() imageKey?: string | null;
  @IsOptional() @IsBoolean() pinned?: boolean;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @Transform(emptyToNull) @IsString() campusId?: string | null;
}

export class AnnouncementsQuery extends PageQuery {
  @IsOptional() @IsString() campusId?: string;
}

export class EventDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(5000) description?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(200) location?: string | null;
  @IsDateString() startsAt: string;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() endsAt?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() imageKey?: string | null;
  @IsOptional() @IsBoolean() isPublic?: boolean;
  @IsOptional() @Transform(emptyToNull) @IsString() campusId?: string | null;
}

export class EventsQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() campusId?: string;
}

export class StreamsQuery {
  @IsOptional() @IsString() campusId?: string;
}

export class StreamDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(2000) description?: string | null;
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Ingresa un enlace https válido' }) url: string;
  @IsOptional() @Transform(emptyToNull) @ValidateIf((_, v) => v !== null) @IsDateString() scheduledAt?: string | null;
  @IsOptional() @IsBoolean() isLive?: boolean;
  @IsOptional() @Transform(emptyToNull) @IsString() campusId?: string | null;
}

export class LiveDto {
  @IsBoolean() isLive: boolean;
}
