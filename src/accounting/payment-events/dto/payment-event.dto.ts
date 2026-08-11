import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
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
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  verifiedAmount?: number;

  @IsString()
  @IsNotEmpty()
  resolvedBy!: string;

  @IsString()
  @IsNotEmpty()
  resolutionReason!: string;
}

export class SearchPaymentEventsDto {
  @ApiPropertyOptional({
    enum: [
      'received',
      'applied',
      'applied_requires_review',
      'recorded_no_effect',
      'unresolved',
      'rejected',
    ],
  })
  @IsOptional()
  @IsIn([
    'received',
    'applied',
    'applied_requires_review',
    'recorded_no_effect',
    'unresolved',
    'rejected',
  ])
  status?:
    | 'received'
    | 'applied'
    | 'applied_requires_review'
    | 'recorded_no_effect'
    | 'unresolved'
    | 'rejected';

  @ApiPropertyOptional({ description: 'Filter by the processing reason' })
  @IsOptional()
  @IsString()
  reason?: string;

  @ApiPropertyOptional({
    enum: ['true', 'false'],
    description: 'Whether the event is linked to a family account',
  })
  @IsOptional()
  @IsBooleanString()
  linked?: 'true' | 'false';

  @ApiPropertyOptional({ description: 'Include events occurring at or after this ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  occurredFrom?: string;

  @ApiPropertyOptional({ description: 'Include events occurring at or before this ISO timestamp' })
  @IsOptional()
  @IsISO8601()
  occurredTo?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}
