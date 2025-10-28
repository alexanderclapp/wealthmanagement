import { Account } from '../../../domain/entities/Account.js';
import { AdviceRecommendation } from '../../../domain/entities/AdviceRecommendation.js';
import { Statement } from '../../../domain/entities/Statement.js';
import { Transaction } from '../../../domain/entities/Transaction.js';
import { VerificationReportDTO } from '../../../application/dto/VerificationReportDTO.js';
import { StoragePort } from '../../../application/ports/StoragePort.js';

export class InMemoryStorageAdapter implements StoragePort {
  private readonly accounts = new Map<string, Account>();
  private readonly statements = new Map<string, Statement>();
  private readonly transactions = new Map<string, Transaction>();
  private readonly advice = new Map<string, AdviceRecommendation>();
  private readonly verifications = new Map<string, VerificationReportDTO>();

  async upsertAccount(account: Account): Promise<void> {
    this.accounts.set(account.id, account);
  }

  async bulkUpsertTransactions(transactions: Transaction[]): Promise<void> {
    for (const txn of transactions) {
      this.transactions.set(txn.dedupeHash, txn);
    }
  }

  async saveStatement(statement: Statement): Promise<void> {
    this.statements.set(statement.id, statement);
  }

  async saveVerificationReport(report: VerificationReportDTO): Promise<void> {
    this.verifications.set(report.statementId, report);
  }

  async loadStatement(statementId: string): Promise<Statement | null> {
    return this.statements.get(statementId) ?? null;
  }

  async loadLatestAccountSnapshot(accountId: string): Promise<Account | null> {
    return this.accounts.get(accountId) ?? null;
  }

  async loadTransactions(
    accountId: string,
    params: { startDate?: string | undefined; endDate?: string | undefined },
  ): Promise<Transaction[]> {
    const allTransactions = Array.from(this.transactions.values()).filter((txn) => txn.accountId === accountId);

    return allTransactions.filter((txn) => {
      const afterStart = params.startDate ? txn.postedDate >= params.startDate : true;
      const beforeEnd = params.endDate ? txn.postedDate <= params.endDate : true;
      return afterStart && beforeEnd;
    });
  }

  async loadAdviceContext(userId: string): Promise<{ accounts: Account[]; transactions: Transaction[] }> {
    // In-memory adapter stores no tenancy; real implementations should filter by userId.
    const allAccounts = Array.from(this.accounts.values());
    const accounts = allAccounts.filter((account) => account.metadata?.userId === userId);
    const accountIds = new Set(accounts.map((account) => account.id));
    const transactions = Array.from(this.transactions.values()).filter((txn) => accountIds.has(txn.accountId));

    console.log('🔍 loadAdviceContext:', {
      userId,
      totalAccountsInStore: allAccounts.length,
      filteredAccounts: accounts.length,
      totalTransactionsInStore: this.transactions.size,
      filteredTransactions: transactions.length,
      accountsMetadata: allAccounts.map(a => ({ id: a.id, userId: a.metadata?.userId })),
    });

    return { accounts, transactions };
  }

  async saveAdviceRecommendations(advice: AdviceRecommendation[]): Promise<void> {
    for (const recommendation of advice) {
      this.advice.set(recommendation.id, recommendation);
    }
  }

  async listStatements(userId: string): Promise<Statement[]> {
    // Filter statements by userId stored in metadata
    const allStatements = Array.from(this.statements.values());
    return allStatements
      .filter((statement) => statement.metadata?.userId === userId)
      .sort((a, b) => new Date(b.ingestedAt).getTime() - new Date(a.ingestedAt).getTime());
  }

  async deleteStatement(statementId: string): Promise<void> {
    const statement = this.statements.get(statementId);
    if (!statement) {
      return;
    }

    // Delete the statement
    this.statements.delete(statementId);

    // Delete all transactions from this statement's account
    const accountId = statement.account.id;
    const transactionsToDelete: string[] = [];
    
    for (const [hash, txn] of this.transactions.entries()) {
      if (txn.accountId === accountId) {
        transactionsToDelete.push(hash);
      }
    }

    for (const hash of transactionsToDelete) {
      this.transactions.delete(hash);
    }

    // Check if this was the only statement for this account
    const otherStatementsForAccount = Array.from(this.statements.values()).some(
      (stmt) => stmt.account.id === accountId
    );

    // If no other statements reference this account, delete the account
    if (!otherStatementsForAccount) {
      this.accounts.delete(accountId);
    }

    // Delete verification report if exists
    this.verifications.delete(statementId);

    console.log(`🗑️ Deleted statement ${statementId} and ${transactionsToDelete.length} transactions`);
  }
}
