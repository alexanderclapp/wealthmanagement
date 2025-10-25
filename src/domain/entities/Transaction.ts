export type TransactionType = 'CREDIT' | 'DEBIT';

export interface Transaction {
  id: string;
  accountId: string;
  postedDate: string; // ISO date
  description: string;
  originalDescription?: string;
  amount: number;
  currency: string;
  type: TransactionType;
  category?: string;
  subCategory?: string;
  normalizedDescription?: string;
  dedupeHash: string;
  metadata?: Record<string, unknown>;
}
