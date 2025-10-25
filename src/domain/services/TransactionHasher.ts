import crypto from 'node:crypto';

export interface TransactionHashInput {
  accountId: string;
  postedDate: string;
  amount: number;
  currency: string;
  normalizedDescription: string;
}

export const buildTransactionHash = (input: TransactionHashInput): string => {
  const serialized = [
    input.accountId,
    input.postedDate,
    input.amount.toFixed(2),
    input.currency.toUpperCase(),
    input.normalizedDescription.trim().toLowerCase(),
  ].join('|');

  return crypto.createHash('sha256').update(serialized).digest('hex');
};
