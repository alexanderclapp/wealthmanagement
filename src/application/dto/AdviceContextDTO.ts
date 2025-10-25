import { z } from 'zod';

export const AdviceContextSchema = z.object({
  userId: z.string(),
  accounts: z.array(
    z.object({
      accountId: z.string(),
      balance: z.number(),
      currency: z.string(),
      type: z.string(),
      goals: z
        .array(
          z.object({
            goalId: z.string(),
            name: z.string(),
            targetAmount: z.number(),
            targetDate: z.string().optional(),
          }),
        )
        .optional(),
    }),
  ),
  incomePerMonth: z.number().optional(),
  expensesPerMonth: z.number().optional(),
  netWorth: z.number().optional(),
  metadata: z.record(z.any()).optional(),
});

export type AdviceContextDTO = z.infer<typeof AdviceContextSchema>;
