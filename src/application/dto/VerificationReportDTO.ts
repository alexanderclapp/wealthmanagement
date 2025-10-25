import { z } from 'zod';

export const VerificationIssueSchema = z.object({
  code: z.string(),
  message: z.string(),
  field: z.string().optional(),
  severity: z.enum(['INFO', 'WARNING', 'ERROR']).default('ERROR'),
  remediation: z.string().optional(),
});

export type VerificationIssueDTO = z.infer<typeof VerificationIssueSchema>;

export const VerificationReportSchema = z.object({
  statementId: z.string(),
  status: z.enum(['PASS', 'FAIL', 'REVIEW', 'PENDING']),
  confidence: z.number().min(0).max(1),
  issues: z.array(VerificationIssueSchema),
  source: z.string(),
  executedAt: z.string(),
  metadata: z.record(z.any()).optional(),
});

export type VerificationReportDTO = z.infer<typeof VerificationReportSchema>;
