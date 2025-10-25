import { CategorizedTransactionDTO } from '../../../application/dto/CategorizedTransactionDTO.js';
import { CategorizerPort } from '../../../application/ports/CategorizerPort.js';

interface Rule {
  test: (input: string) => boolean;
  category: string;
  subCategory?: string;
}

const rules: Rule[] = [
  { test: (desc) => /\b(payroll|salary|paycheck)\b/i.test(desc), category: 'Income', subCategory: 'Salary' },
  { test: (desc) => /\b(uber|lyft|transport|metro)\b/i.test(desc), category: 'Transportation' },
  { test: (desc) => /\b(grocery|market|whole foods|trader joe)/i.test(desc), category: 'Food', subCategory: 'Groceries' },
  { test: (desc) => /\brent\b/i.test(desc), category: 'Housing', subCategory: 'Rent' },
  { test: (desc) => /\b(plan|etf|investment)\b/i.test(desc), category: 'Investments' },
];

export class RuleBasedCategorizer implements CategorizerPort {
  async categorize(
    transactions: Array<{ dedupeHash: string; description: string; amount: number; currency: string }>,
    _context: { accountId: string; institutionId?: string | undefined },
  ): Promise<Record<string, CategorizedTransactionDTO>> {
    const categorized: Record<string, CategorizedTransactionDTO> = {};

    for (const txn of transactions) {
      const rule = rules.find((candidate) => candidate.test(txn.description));

      if (!rule) {
        continue;
      }

      categorized[txn.dedupeHash] = {
        dedupeHash: txn.dedupeHash,
        category: rule.category,
        subCategory: rule.subCategory,
        confidence: 0.6,
      };
    }

    return categorized;
  }
}
