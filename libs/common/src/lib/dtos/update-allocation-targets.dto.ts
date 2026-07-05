import { DataSource, PurchaseMode } from '@prisma/client';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested
} from 'class-validator';

export class AllocationTargetItemDto {
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
  @MaxLength(64)
  symbol: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Max(100)
  @Min(0.01)
  targetPercentage: number;
}

export class UpdateAllocationTargetsDto {
  @ArrayMaxSize(100)
  @ArrayNotEmpty()
  @IsArray()
  @Type(() => AllocationTargetItemDto)
  @ValidateNested({ each: true })
  targets: AllocationTargetItemDto[];
}
