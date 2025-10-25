import { z } from 'zod';

export const CategorizedTransactionSchema = z.object({
  dedupeHash: z.string(),
  category: z.string(),
  subCategory: z.string().optional(),
  confidence: z.number().min(0).max(1),
  riskFlags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type CategorizedTransactionDTO = z.infer<typeof CategorizedTransactionSchema>;
