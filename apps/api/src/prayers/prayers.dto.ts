import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

export const PRAYER_VIEWS = ['active', 'answered', 'archived'] as const;
export type PrayerView = (typeof PRAYER_VIEWS)[number];

const toBool = ({ value }: { value: unknown }) => value === true || value === 'true' || value === '1';

export class PrayerRequestDto {
  @IsString() @MinLength(3, { message: 'Cuéntanos un poco más tu pedido' }) @MaxLength(2000) body: string;
  @IsOptional() @IsBoolean() shared?: boolean;
  @IsOptional() @IsBoolean() anonymous?: boolean;
}

export class PrayerUpdateDto {
  @IsOptional() @IsBoolean() answered?: boolean;
  @IsOptional() @IsBoolean() archived?: boolean;
}

export class PrayerFilter {
  @IsOptional() @IsIn(PRAYER_VIEWS) view: PrayerView = 'active';
  /** Solo las propias. */
  @IsOptional() @Transform(toBool) @IsBoolean() mine?: boolean;
  /** Solo las de los últimos N días. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}

export class PrayersQuery extends PageQuery {
  @IsOptional() @IsIn(PRAYER_VIEWS) view: PrayerView = 'active';
  @IsOptional() @Transform(toBool) @IsBoolean() mine?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) days?: number;
}
