import crypto from 'node:crypto';
import { AdviceContextDTO } from '../../../application/dto/AdviceContextDTO.js';
import { AdviceRecommendationDTO } from '../../../application/dto/AdviceRecommendationDTO.js';
import { AdviceEnginePort } from '../../../application/ports/AdviceEnginePort.js';

const generateId = () => crypto.randomUUID();

export class RuleBasedAdviceEngine implements AdviceEnginePort {
  async generateAdvice(context: AdviceContextDTO): Promise<AdviceRecommendationDTO[]> {
    const recommendations: AdviceRecommendationDTO[] = [];
    const emergencyFundTarget = 3;

    for (const account of context.accounts) {
      if (account.type === 'CHECKING' || account.type === 'SAVINGS') {
        const monthlyExpenses = context.expensesPerMonth ?? 0;
        if (monthlyExpenses > 0) {
          const recommendedEmergencyFund = monthlyExpenses * emergencyFundTarget;
          if (account.balance < recommendedEmergencyFund) {
            recommendations.push({
              id: generateId(),
              accountId: account.accountId,
              type: 'EMERGENCY_FUND',
              title: 'Build your emergency fund',
              summary: `Increase balance in ${account.accountId} to ${recommendedEmergencyFund.toFixed(
                2,
              )} to cover ${emergencyFundTarget} months of expenses.`,
              rationale: 'Emergency reserves below recommended threshold.',
              impactEstimate: {
                currency: account.currency,
                amount: recommendedEmergencyFund - account.balance,
                timeframeMonths: emergencyFundTarget,
              },
              prerequisites: ['Confirm monthly expense average', 'Automate transfers from income account'],
              metadata: {},
            });
          }
        }
      }
    }

    const savingsRate = this.calculateSavingsRate(context);
    if (savingsRate !== undefined && savingsRate < 0.2) {
      recommendations.push({
        id: generateId(),
        type: 'SAVINGS_RATE',
        title: 'Increase your savings rate',
        summary: 'Allocate at least 20% of monthly income to savings or investments.',
        rationale: 'Savings rate below 20% benchmark.',
        impactEstimate: context.incomePerMonth
          ? {
              currency: context.accounts[0]?.currency ?? 'USD',
              amount: context.incomePerMonth * 0.2,
              timeframeMonths: 12,
            }
          : undefined,
        prerequisites: ['Review recurring expenses', 'Set up auto-transfer to brokerage'],
        metadata: { currentSavingsRate: savingsRate },
      });
    }

    return recommendations;
  }

  private calculateSavingsRate(context: AdviceContextDTO): number | undefined {
    if (!context.incomePerMonth || !context.expensesPerMonth) {
      return undefined;
    }

    const savings = Math.max(context.incomePerMonth - context.expensesPerMonth, 0);
    if (context.incomePerMonth === 0) {
      return undefined;
    }

    return Math.round((savings / context.incomePerMonth) * 100) / 100;
  }
}
