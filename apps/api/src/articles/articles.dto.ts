import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { PageQuery } from '../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class ArticleDto {
  @IsString() @MinLength(2) @MaxLength(160) title: string;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(500) summary?: string | null;
  /** HTML del editor; se sanea en el servidor. */
  @IsString() @MinLength(1) @MaxLength(500_000) body: string;
  @IsOptional() @Transform(emptyToNull) @IsString() coverKey?: string | null;
  @IsOptional() @IsBoolean() published?: boolean;
  @IsOptional() @Transform(emptyToNull) @IsString() campusId?: string | null;
}

export class ArticlesQuery extends PageQuery {
  @IsOptional() @IsString() campusId?: string;
}
