import { Account } from '../../domain/entities/Account.js';
import { Statement } from '../../domain/entities/Statement.js';
import { Transaction, TransactionType } from '../../domain/entities/Transaction.js';
import { buildTransactionHash } from '../../domain/services/TransactionHasher.js';
import { normalizeDescription } from '../../domain/services/DescriptionNormalizer.js';
import { ParsedStatementDTO } from '../dto/ParsedStatementDTO.js';
import { CategorizerPort } from '../ports/CategorizerPort.js';
import { FXConverterPort } from '../ports/FXConverterPort.js';
import { StatementParserPort } from '../ports/StatementParserPort.js';
import { StoragePort } from '../ports/StoragePort.js';
import { IngestionValidationService } from './IngestionValidationService.js';

export interface IngestStatementParams {
  statementId: string;
  rawStatement: Buffer;
  parserOptions?: {
    accountIdHint?: string;
    institutionId?: string;
    password?: string;
    metadata?: Record<string, unknown>;
  };
  baseCurrency?: string;
}

export class IngestionService {
  constructor(
    private readonly parser: StatementParserPort,
    private readonly storage: StoragePort,
    private readonly categorizer: CategorizerPort,
    private readonly fxConverter: FXConverterPort,
    private readonly validation: IngestionValidationService,
  ) {}

  async ingestStatement(params: IngestStatementParams): Promise<{ statement: Statement; verificationStatus: string }> {
    const parsed = await this.parser.parse(params.rawStatement, {
      statementId: params.statementId,
      accountIdHint: params.parserOptions?.accountIdHint,
      institutionId: params.parserOptions?.institutionId,
      password: params.parserOptions?.password,
      metadata: params.parserOptions?.metadata,
    });

    const verificationReport = await this.validation.validate(parsed, params.statementId);

    const account = this.mapAccount(parsed);
    const transactions = await this.mapTransactions(parsed, account, params.baseCurrency);

    const statement: Statement = {
      id: params.statementId,
      account,
      statementPeriodStart: parsed.period.start,
      statementPeriodEnd: parsed.period.end,
      openingBalance: parsed.openingBalance,
      closingBalance: parsed.closingBalance,
      currency: parsed.currency,
      transactions,
      rawStatementUri: parsed.rawStatementUri,
      source: parsed.source,
      ingestedAt: new Date().toISOString(),
      verificationStatus: verificationReport.status,
      metadata: parsed.metadata,
    };

    await this.storage.upsertAccount(account);
    await this.storage.bulkUpsertTransactions(transactions);
    await this.storage.saveStatement(statement);

    return { statement, verificationStatus: verificationReport.status };
  }

  private mapAccount(parsed: ParsedStatementDTO): Account {
    return {
      id: parsed.account.accountId,
      institutionId: parsed.account.institutionId,
      mask: parsed.account.mask,
      name: parsed.account.name,
      type: this.resolveAccountType(parsed.account.type),
      currency: parsed.account.currency,
      balance: parsed.closingBalance,
      asOf: parsed.period.end,
      metadata: parsed.metadata,
    };
  }

  private async mapTransactions(
    parsed: ParsedStatementDTO,
    account: Account,
    baseCurrency?: string,
  ): Promise<Transaction[]> {
    const categorizationInput = parsed.transactions.map((txn) => {
      const normalizedDescription = normalizeDescription(txn.description);
      const dedupeHash = buildTransactionHash({
        accountId: account.id,
        postedDate: txn.postedDate,
        amount: txn.amount,
        currency: txn.currency,
        normalizedDescription,
      });

      return {
        dedupeHash,
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

    const transactions: Transaction[] = [];

    for (const txn of parsed.transactions) {
      const normalizedDescription = normalizeDescription(txn.description);
      const dedupeHash = buildTransactionHash({
        accountId: account.id,
        postedDate: txn.postedDate,
        amount: txn.amount,
        currency: txn.currency,
        normalizedDescription,
      });

      const category = categorization[dedupeHash];
      const needsConversion = baseCurrency && txn.currency !== baseCurrency;
      let convertedAmount = txn.amount;

      let conversionRate: number | undefined;

      if (needsConversion) {
        const { convertedAmount: amount, rate } = await this.fxConverter.convert(
          txn.amount,
          txn.currency,
          baseCurrency,
          txn.postedDate,
        );
        convertedAmount = amount;
        conversionRate = rate;
      }

      const transaction: Transaction = {
        id: txn.externalId ?? dedupeHash,
        accountId: account.id,
        postedDate: txn.postedDate,
        description: txn.description,
        originalDescription: txn.metadata?.originalDescription as string | undefined,
        amount: convertedAmount,
        currency: needsConversion ? baseCurrency! : txn.currency,
        type: this.resolveTransactionType(txn.amount, txn.type),
        category: category?.category,
        subCategory: category?.subCategory,
        normalizedDescription,
        dedupeHash,
        metadata: {
          ...txn.metadata,
          balanceAfter: txn.balanceAfter,
          originalCurrency: txn.currency,
          convertedCurrency: needsConversion ? baseCurrency : undefined,
          conversionRate,
        },
      };

      transactions.push(transaction);
    }

    return transactions;
  }

  private resolveAccountType(type: string): Account['type'] {
    const normalized = type.toUpperCase();
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

  private resolveTransactionType(amount: number, provided?: TransactionType): TransactionType {
    if (provided) {
      return provided;
    }

    return amount >= 0 ? 'CREDIT' : 'DEBIT';
  }
}
