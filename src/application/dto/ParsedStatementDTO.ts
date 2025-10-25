import { z } from 'zod';

export const ParsedTransactionSchema = z.object({
  externalId: z.string().optional(),
  accountId: z.string(),
  postedDate: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  type: z.enum(['CREDIT', 'DEBIT']).optional(),
  balanceAfter: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ParsedTransactionDTO = z.infer<typeof ParsedTransactionSchema>;

export const ParsedStatementSchema = z.object({
  account: z.object({
    externalId: z.string().optional(),
    accountId: z.string(),
    institutionId: z.string(),
    name: z.string(),
    mask: z.string().optional(),
    type: z.string(),
    currency: z.string(),
  }),
  period: z.object({
    start: z.string(),
    end: z.string(),
  }),
  openingBalance: z.number(),
  closingBalance: z.number(),
  transactions: z.array(ParsedTransactionSchema),
  currency: z.string(),
  source: z.enum(['PDF', 'AGGREGATOR']),
  rawStatementUri: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ParsedStatementDTO = z.infer<typeof ParsedStatementSchema>;
