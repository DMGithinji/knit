import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsIn,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class CreateInvoiceLineItemDto {
  @IsOptional()
  @IsString()
  studentId?: string;

  @IsString()
  @IsNotEmpty()
  description!: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  amount!: number;
}

export class CreateInvoiceDto {
  @IsString()
  @IsNotEmpty()
  invoiceReference!: string;

  @IsIn(['ZAR'])
  currency!: 'ZAR';

  @IsISO8601()
  issuedAt!: string;

  @IsISO8601()
  dueAt!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateInvoiceLineItemDto)
  lineItems!: CreateInvoiceLineItemDto[];
}
