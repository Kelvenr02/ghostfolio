import { IsCurrencyCode } from '@ghostfolio/common/validators/is-currency-code';

import { DataSource, PurchaseMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested
} from 'class-validator';

export class AllocationTargetItemDto {
  @IsCurrencyCode()
  currency: string;

  @IsEnum(DataSource)
  dataSource: DataSource;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  minPurchaseValue?: number;

  @IsEnum(PurchaseMode)
  purchaseMode: PurchaseMode;

  @IsNotEmpty()
  @IsString()
  symbol: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(100)
  @Min(0.01)
  targetPercentage: number;
}

export class UpdateAllocationTargetsDto {
  @ArrayNotEmpty()
  @IsArray()
  @Type(() => AllocationTargetItemDto)
  @ValidateNested({ each: true })
  targets: AllocationTargetItemDto[];
}
