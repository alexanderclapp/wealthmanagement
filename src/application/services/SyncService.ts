import { Account } from '../../domain/entities/Account.js';
import { Transaction } from '../../domain/entities/Transaction.js';
import { buildTransactionHash } from '../../domain/services/TransactionHasher.js';
import { normalizeDescription } from '../../domain/services/DescriptionNormalizer.js';
import { BankAggregatorPort } from '../ports/BankAggregatorPort.js';
import { CategorizerPort } from '../ports/CategorizerPort.js';
import { FXConverterPort } from '../ports/FXConverterPort.js';
import { StoragePort } from '../ports/StoragePort.js';

export interface SyncAccountParams {
  accessToken: string;
  startDate: string;
  endDate: string;
  baseCurrency?: string;
  userId: string;
}

export class SyncService {
  constructor(
    private readonly aggregator: BankAggregatorPort,
    private readonly storage: StoragePort,
    private readonly categorizer: CategorizerPort,
    private readonly fxConverter: FXConverterPort,
  ) {}

  async sync(params: SyncAccountParams): Promise<{ accounts: Account[]; transactions: Transaction[] }> {
    const externalAccounts = await this.aggregator.fetchAccounts(params.accessToken);

    const accounts: Account[] = [];
    const transactions: Transaction[] = [];

    for (const extAccount of externalAccounts) {
      const account: Account = {
        id: extAccount.id,
        institutionId: extAccount.institutionId,
        mask: extAccount.mask,
        name: extAccount.name,
        type: this.resolveAccountType(extAccount.type),
        currency: extAccount.currency,
        balance: extAccount.balance,
        asOf: extAccount.asOf,
        metadata: {
          ...extAccount.metadata,
          userId: params.userId,
        },
      };

      accounts.push(account);
      await this.storage.upsertAccount(account);

      const externalTransactions = await this.aggregator.fetchTransactions(params.accessToken, {
        accountId: extAccount.id,
        startDate: params.startDate,
        endDate: params.endDate,
      });

      const categorizationInput = externalTransactions.map((txn) => {
        const normalized = normalizeDescription(txn.description);
        const dedupe = buildTransactionHash({
          accountId: txn.accountId,
          postedDate: txn.postedAt,
          amount: txn.amount,
          currency: txn.currency,
          normalizedDescription: normalized,
        });

        return {
          dedupeHash: dedupe,
          description: txn.description,
          amount: txn.amount,
          currency: txn.currency,
          metadata: txn.metadata,
        };
      });

      const categorization = await this.categorizer.categorize(categorizationInput, {
        accountId: account.id,
        institutionId: account.institutionId,
      });

      for (const txn of externalTransactions) {
        const normalizedDescription = normalizeDescription(txn.description);
        const dedupeHash = buildTransactionHash({
          accountId: txn.accountId,
          postedDate: txn.postedAt,
          amount: txn.amount,
          currency: txn.currency,
          normalizedDescription,
        });

        const category = categorization[dedupeHash];
        const needsConversion = Boolean(params.baseCurrency && txn.currency !== params.baseCurrency);
        let convertedAmount = txn.amount;
        let conversionRate: number | undefined;

        if (needsConversion && params.baseCurrency) {
          const { convertedAmount: amount, rate } = await this.fxConverter.convert(
            txn.amount,
            txn.currency,
            params.baseCurrency,
            txn.postedAt,
          );

          convertedAmount = amount;
          conversionRate = rate;
        }

        const transaction: Transaction = {
          id: txn.id,
          accountId: txn.accountId,
          postedDate: txn.postedAt,
          description: txn.description,
          originalDescription: txn.metadata?.originalDescription as string | undefined,
          amount: convertedAmount,
          currency: needsConversion && params.baseCurrency ? params.baseCurrency : txn.currency,
          type: txn.amount >= 0 ? 'CREDIT' : 'DEBIT',
          category: category?.category ?? txn.category,
          subCategory: category?.subCategory,
          normalizedDescription,
          dedupeHash,
          metadata: {
            ...txn.metadata,
            originalCurrency: txn.currency,
            convertedCurrency: needsConversion ? params.baseCurrency : undefined,
            conversionRate,
            userId: params.userId,
          },
        };

        transactions.push(transaction);
      }
    }

    if (transactions.length > 0) {
      await this.storage.bulkUpsertTransactions(transactions);
    }

    return { accounts, transactions };
  }

  private resolveAccountType(input: string): Account['type'] {
    const normalized = input.toUpperCase();
    const mapping: Record<string, Account['type']> = {
      CHECKING: 'CHECKING',
      DEPOSITORY: 'CHECKING',
      SAVINGS: 'SAVINGS',
      CREDIT: 'CREDIT',
      BROKERAGE: 'BROKERAGE',
      INVESTMENT: 'BROKERAGE',
      IRA: 'RETIREMENT',
      LOAN: 'LOAN',
    };

    return mapping[normalized] ?? 'OTHER';
  }
}
