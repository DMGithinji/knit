import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class SchoolConfigDto {
  @IsIn(['ZAR'])
  currency!: 'ZAR';

  @IsInt()
  @Min(0)
  @Max(365)
  gracePeriodDays!: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @Min(1, { each: true })
  reminderCadenceDays!: number[];

  @IsBoolean()
  allowPartialPayments!: boolean;

  @IsInt()
  @Min(0)
  @Max(365)
  arrearsAfterDays!: number;
}

export class CreateConfigVersionDto {
  @ValidateNested()
  @Type(() => SchoolConfigDto)
  config!: SchoolConfigDto;

  @IsString()
  @IsNotEmpty()
  createdBy!: string;

  @IsString()
  @IsNotEmpty()
  changeReason!: string;
}

export class ActivateConfigVersionDto {
  @IsOptional()
  @IsString()
  expectedCurrentVersionId!: string | null;

  @IsString()
  @IsNotEmpty()
  activatedBy!: string;

  @IsString()
  @IsNotEmpty()
  activationReason!: string;
}
