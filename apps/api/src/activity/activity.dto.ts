import { ActivityEntity } from '@prisma/client';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { PageQuery } from '../common/pagination';

export class ActivityQuery extends PageQuery {
  @IsOptional() @IsEnum(ActivityEntity) entity?: ActivityEntity;
  @IsOptional() @IsString() userId?: string;
}
