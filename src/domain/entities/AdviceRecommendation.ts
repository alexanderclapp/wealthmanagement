export type AdviceType =
  | 'CASH_FLOW'
  | 'DEBT_PAYDOWN'
  | 'SAVINGS_RATE'
  | 'INVESTMENT_ALLOCATION'
  | 'EMERGENCY_FUND'
  | 'INSURANCE_COVERAGE';

export interface AdviceRecommendation {
  id: string;
  accountId?: string;
  type: AdviceType;
  title: string;
  summary: string;
  rationale: string;
  impactEstimate?: {
    currency: string;
    amount: number;
    timeframeMonths?: number;
  };
  prerequisites?: string[];
  createdAt: string; // ISO timestamp
  metadata?: Record<string, unknown>;
}
