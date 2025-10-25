import { z } from 'zod';

export const ExternalAccountSchema = z.object({
  id: z.string(),
  institutionId: z.string(),
  name: z.string(),
  mask: z.string().optional(),
  type: z.string(),
  subtype: z.string().optional(),
  currency: z.string(),
  balance: z.number(),
  availableBalance: z.number().optional(),
  asOf: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type ExternalAccountDTO = z.infer<typeof ExternalAccountSchema>;

export const ExternalTransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  postedAt: z.string(),
  description: z.string(),
  amount: z.number(),
  currency: z.string(),
  category: z.string().optional(),
  merchantName: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type ExternalTransactionDTO = z.infer<typeof ExternalTransactionSchema>;
