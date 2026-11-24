import { IsBoolean, IsDateString, IsEmail, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CheckoutDto {
  /** El piso depende de la pasarela y se comprueba en el servicio. */
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'El importe no es válido' })
  @Min(0.01)
  @Max(100_000_000)
  amount!: number;

  /** Solo Mercado Pago: el correo de la cuenta que va a pagar. */
  @IsOptional()
  @IsEmail({}, { message: 'El correo no es válido' })
  payerEmail?: string;
}

export class AdminBillingUpdateDto {
  @IsOptional() @IsBoolean() billingExempt?: boolean;

  @IsOptional() @IsString() @MaxLength(500) billingExemptNote?: string;

  /** Plazo extra sin suscripción; null lo quita. */
  @IsOptional() @IsDateString({}, { message: 'La fecha no es válida' }) billingGraceUntil?: string | null;

  /** Al eximir, deja de cobrar la suscripción vigente. */
  @IsOptional() @IsBoolean() cancelSubscriptions?: boolean;
}
