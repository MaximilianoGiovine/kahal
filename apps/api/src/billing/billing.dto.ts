import { Currency } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class AdminBillingUpdateDto {
  @IsOptional() @IsBoolean() billingExempt?: boolean;

  @IsOptional() @IsString() @MaxLength(500) billingExemptNote?: string;

  /** Corrige la fecha de activación sin registrar una donación; null deja la iglesia sin activar. */
  @IsOptional() @IsDateString({}, { message: 'La fecha no es válida' }) billingActiveUntil?: string | null;
}

export class RecordDonationDto {
  /** Hasta cuándo queda activa la iglesia con esta donación. */
  @IsDateString({}, { message: 'La fecha no es válida' })
  coversUntil!: string;

  /** El importe es opcional: se puede activar sin registrarlo. */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El importe no es válido' })
  @Min(0.01)
  @Max(100_000_000)
  amount?: number;

  @IsOptional() @IsEnum(Currency, { message: 'La moneda no es válida' }) currency?: Currency;

  @IsOptional() @IsDateString({}, { message: 'La fecha no es válida' }) receivedAt?: string;

  @IsOptional() @IsString() @MaxLength(500) note?: string;
}
