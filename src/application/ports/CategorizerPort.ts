import { CategorizedTransactionDTO } from '../dto/CategorizedTransactionDTO.js';

export interface CategorizerPort {
  categorize(
    transactions: Array<{ dedupeHash: string; description: string; amount: number; currency: string; metadata?: Record<string, unknown> }>,
    context: { accountId: string; institutionId?: string },
  ): Promise<Record<string, CategorizedTransactionDTO>>;
}
