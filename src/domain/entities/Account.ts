export type AccountType =
  | 'CHECKING'
  | 'SAVINGS'
  | 'CREDIT'
  | 'BROKERAGE'
  | 'RETIREMENT'
  | 'LOAN'
  | 'OTHER';

export interface Account {
  id: string;
  institutionId: string;
  mask?: string;
  name: string;
  type: AccountType;
  currency: string;
  balance: number;
  asOf: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}
