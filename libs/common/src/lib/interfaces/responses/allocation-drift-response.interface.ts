export interface AllocationDriftItem {
  currentPercentage: number;
  deviationInPercentage: number;
  name?: string;
  symbol: string;
  targetPercentage: number;
}

export interface AllocationDriftResponse {
  asOf: string;
  driftThresholdPercent: number;
  isDrifted: boolean;
  items: AllocationDriftItem[];
}
