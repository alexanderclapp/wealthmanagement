import { z } from 'zod';

export const AdviceRecommendationSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  summary: z.string(),
  rationale: z.string(),
  impactEstimate: z
    .object({
      currency: z.string(),
      amount: z.number(),
      timeframeMonths: z.number().optional(),
    })
    .optional(),
  prerequisites: z.array(z.string()).optional(),
  accountId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type AdviceRecommendationDTO = z.infer<typeof AdviceRecommendationSchema>;
