import { Type } from 'class-transformer';
import { IsNumber, Max, Min } from 'class-validator';

export class GetContributionPlanQueryDto {
  @Type(() => Number) // query param arrives as a string; transform:true is global
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0) // B = 0 is VALID (invariant 6)
  @Max(100_000_000) // sanity bound (also bounds the greedy loop's iterations)
  amount: number;
}
