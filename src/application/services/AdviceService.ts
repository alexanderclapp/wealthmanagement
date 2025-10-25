import { AdviceRecommendation } from '../../domain/entities/AdviceRecommendation.js';
import { AdviceEnginePort } from '../ports/AdviceEnginePort.js';
import { StoragePort } from '../ports/StoragePort.js';
import { AdviceContextSchema } from '../dto/AdviceContextDTO.js';

export class AdviceService {
  constructor(
    private readonly storage: StoragePort,
    private readonly adviceEngine: AdviceEnginePort,
  ) {}

  async generateAdvice(userId: string): Promise<AdviceRecommendation[]> {
    const { accounts, transactions } = await this.storage.loadAdviceContext(userId);

    const context = AdviceContextSchema.parse({
      userId,
      accounts: accounts.map((account) => ({
        accountId: account.id,
        balance: account.balance,
        currency: account.currency,
        type: account.type,
      })),
      incomePerMonth: this.estimateIncome(transactions),
      expensesPerMonth: this.estimateExpenses(transactions),
      netWorth: accounts.reduce((total, account) => total + account.balance, 0),
    });

    const adviceDtos = await this.adviceEngine.generateAdvice(context);

    const advice: AdviceRecommendation[] = adviceDtos.map((dto) => ({
      id: dto.id,
      type: dto.type as AdviceRecommendation['type'],
      title: dto.title,
      summary: dto.summary,
      rationale: dto.rationale,
      impactEstimate: dto.impactEstimate,
      prerequisites: dto.prerequisites,
      accountId: dto.accountId,
      createdAt: new Date().toISOString(),
      metadata: dto.metadata,
    }));

    await this.storage.saveAdviceRecommendations(advice);

    return advice;
  }

  private estimateIncome(transactions: { amount: number; type: string }[]): number | undefined {
    const credits = transactions
      .filter((txn) => txn.type === 'CREDIT' && txn.amount > 0)
      .map((txn) => txn.amount);

    if (credits.length === 0) {
      return undefined;
    }

    const avgCredit = credits.reduce((sum, amount) => sum + amount, 0) / credits.length;
    return Math.round(avgCredit * 100) / 100;
  }

  private estimateExpenses(transactions: { amount: number; type: string }[]): number | undefined {
    const debits = transactions
      .filter((txn) => txn.type === 'DEBIT' && txn.amount < 0)
      .map((txn) => Math.abs(txn.amount));

    if (debits.length === 0) {
      return undefined;
    }

    const avgDebit = debits.reduce((sum, amount) => sum + amount, 0) / debits.length;
    return Math.round(avgDebit * 100) / 100;
  }
}
