import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class PageQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize = 25;

  @IsOptional()
  @IsString()
  q?: string;
}

export function paginate(query: PageQuery) {
  return { skip: (query.page - 1) * query.pageSize, take: query.pageSize };
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}
