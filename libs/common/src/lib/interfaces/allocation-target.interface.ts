import { DataSource, PurchaseMode } from '@prisma/client';

export interface AllocationTarget {
  dataSource: DataSource;
  id: string;
  minPurchaseValue?: number;
  name?: string;
  purchaseMode: PurchaseMode;
  symbol: string;
  symbolProfileId: string;
  targetPercentage: number;
}
