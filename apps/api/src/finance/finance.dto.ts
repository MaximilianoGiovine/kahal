import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsHexColor,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Currency, TransactionType } from '@prisma/client';
import { PageQuery } from '../common/pagination';

const emptyToNull = ({ value }: { value: unknown }) => (value === '' ? null : value);

export class AccountDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) initialBalance?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class CategoryDto {
  @IsString() @MinLength(2) @MaxLength(60) name: string;
  @IsEnum(TransactionType) type: TransactionType;
  @IsOptional() @IsHexColor() color?: string;
  @IsOptional() @IsBoolean() isTithe?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class TransactionDto {
  @IsString() accountId: string;
  @IsString() categoryId: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Monto inválido' })
  @IsPositive({ message: 'El monto debe ser mayor a cero' })
  @Max(999_999_999_999)
  amount: number;

  @IsDateString({}, { message: 'Fecha inválida' }) date: string;
  @IsOptional() @Transform(emptyToNull) @IsString() memberId?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(500) description?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() @MaxLength(100) reference?: string | null;
  @IsOptional() @Transform(emptyToNull) @IsString() receiptKey?: string | null;
}

export class RangeQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
}

export class TransactionsQuery extends PageQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsEnum(TransactionType) type?: TransactionType;
  @IsOptional() @IsString() accountId?: string;
  @IsOptional() @IsString() categoryId?: string;
  @IsOptional() @IsString() memberId?: string;
  @IsOptional() @IsEnum(Currency) currency?: Currency;
}
