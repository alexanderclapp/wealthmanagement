import { Account } from './Account.js';
import { Transaction } from './Transaction.js';

export interface Statement {
  id: string;
  account: Account;
  statementPeriodStart: string; // ISO date
  statementPeriodEnd: string; // ISO date
  openingBalance: number;
  closingBalance: number;
  currency: string;
  transactions: Transaction[];
  rawStatementUri?: string;
  source: 'PDF' | 'AGGREGATOR';
  ingestedAt: string; // ISO timestamp
  verificationStatus: 'PENDING' | 'PASS' | 'FAIL' | 'REVIEW';
  metadata?: Record<string, unknown>;
}
