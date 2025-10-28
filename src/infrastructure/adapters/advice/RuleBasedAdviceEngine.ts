import crypto from 'node:crypto';
import OpenAI from 'openai';
import { AdviceContextDTO } from '../../../application/dto/AdviceContextDTO.js';
import { AdviceRecommendationDTO } from '../../../application/dto/AdviceRecommendationDTO.js';
import { AdviceEnginePort, QuestionAnswerRequest } from '../../../application/ports/AdviceEnginePort.js';

const generateId = () => crypto.randomUUID();

const openRouterClient = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      timeout: 25000,
      maxRetries: 0,
    })
  : null;

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

  async answerQuestion(request: QuestionAnswerRequest): Promise<string> {
    if (!openRouterClient) {
      console.log('⚠️ OpenRouter API key not configured, falling back to simple response');
      return this.fallbackAnswer(request.question, request.context);
    }

    try {
      console.log('🤖 Using LLM for financial advice');

      const financialSummary = this.buildFinancialSummary(request);
      
      const systemPrompt = `You are an expert financial advisor. Provide personalized, actionable advice based on the user's financial data.

Key principles:
- Be specific with numbers from their actual data
- Give concrete, actionable recommendations
- Explain your reasoning clearly
- Consider their income, expenses, and spending patterns
- Be encouraging but realistic
- Keep responses concise (2-3 paragraphs max)`;

      const userPrompt = `Based on my financial data, please answer this question: "${request.question}"

My Financial Summary:
${financialSummary}

Please provide specific, actionable advice based on my actual numbers.`;

      const response = await openRouterClient.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        max_tokens: 500,
      });

      const advice = response.choices[0]?.message?.content;
      if (!advice) {
        console.log('❌ No response from LLM');
        return this.fallbackAnswer(request.question, request.context);
      }

      console.log('✅ LLM advice generated');
      return advice;
    } catch (error) {
      console.error('❌ LLM advice generation failed:', error);
      return this.fallbackAnswer(request.question, request.context);
    }
  }

  private buildFinancialSummary(request: QuestionAnswerRequest): string {
    const { context, categoryBreakdown, recentTransactions } = request;
    const parts: string[] = [];

    // Account balances
    if (context.accounts.length > 0) {
      parts.push('📊 Accounts:');
      context.accounts.forEach((acc) => {
        parts.push(`  - ${acc.type}: $${acc.balance.toLocaleString()} ${acc.currency}`);
      });
    }

    // Income and expenses
    if (context.incomePerMonth !== undefined) {
      parts.push(`\n💰 Monthly Income: $${context.incomePerMonth.toLocaleString()}`);
    }
    if (context.expensesPerMonth !== undefined) {
      parts.push(`💸 Monthly Expenses: $${context.expensesPerMonth.toLocaleString()}`);
    }

    // Savings rate
    const savingsRate = this.calculateSavingsRate(context);
    if (savingsRate !== undefined) {
      parts.push(`📈 Savings Rate: ${(savingsRate * 100).toFixed(1)}%`);
    }

    // Net worth
    if (context.netWorth !== undefined) {
      parts.push(`🏦 Net Worth: $${context.netWorth.toLocaleString()}`);
    }

    // Category breakdown
    if (categoryBreakdown && categoryBreakdown.length > 0) {
      parts.push('\n🏷️ Top Spending Categories:');
      categoryBreakdown.slice(0, 5).forEach((cat) => {
        parts.push(`  - ${cat.category}: $${cat.total.toLocaleString()} (${cat.percentage.toFixed(1)}%)`);
      });
    }

    // Recent transactions
    if (recentTransactions && recentTransactions.length > 0) {
      parts.push('\n📝 Recent Transactions:');
      recentTransactions.slice(0, 5).forEach((txn) => {
        const sign = txn.amount >= 0 ? '+' : '';
        parts.push(`  - ${txn.date}: ${txn.description} ${sign}$${txn.amount.toLocaleString()} (${txn.category || 'Uncategorized'})`);
      });
    }

    return parts.join('\n');
  }

  private fallbackAnswer(question: string, context: AdviceContextDTO): string {
    const lowercase = question.toLowerCase();

    if (lowercase.includes('invest') || lowercase.includes('allocation')) {
      return 'Consider targeting a 80/20 equity-to-fixed income allocation using low-cost ETFs. Automate monthly contributions after each paycheck to stay consistent.';
    }

    if (lowercase.includes('savings') || lowercase.includes('emergency')) {
      const monthlyExpenses = context.expensesPerMonth ?? 0;
      if (monthlyExpenses > 0) {
        const target = monthlyExpenses * 3;
        return `Aim to keep $${target.toLocaleString()} in liquid reserves (3 months of expenses). Build this up gradually by setting aside 10-15% of each paycheck.`;
      }
    }

    return 'Based on your financial data, continue maintaining positive cashflow and consider increasing your savings rate to at least 20% of income.';
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
