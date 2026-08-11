import {
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateIf,
} from 'class-validator';

export class PaymentEventDto {
  @IsString()
  @IsNotEmpty()
  event_id!: string;

  @IsIn(['payment.succeeded', 'payment.failed', 'payment.refunded'])
  type!: 'payment.succeeded' | 'payment.failed' | 'payment.refunded';

  @IsString()
  @IsNotEmpty()
  family_id!: string;

  @IsString()
  @IsNotEmpty()
  invoice_id!: string;

  @IsInt()
  amount_cents!: number;

  @IsString()
  @IsNotEmpty()
  currency!: string;

  @IsISO8601()
  occurred_at!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ManualPaymentEventResolutionDto {
  @IsIn(['apply_verified_zar', 'record_no_effect'])
  decision!: 'apply_verified_zar' | 'record_no_effect';

  @ValidateIf((input: ManualPaymentEventResolutionDto) => input.decision === 'apply_verified_zar')
  @IsInt()
  @Min(1)
  verifiedAmountCents?: number;

  @IsString()
  @IsNotEmpty()
  resolvedBy!: string;

  @IsString()
  @IsNotEmpty()
  resolutionReason!: string;
}
