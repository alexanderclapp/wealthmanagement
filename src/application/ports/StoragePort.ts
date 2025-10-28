import { Account } from '../../domain/entities/Account.js';
import { AdviceRecommendation } from '../../domain/entities/AdviceRecommendation.js';
import { Statement } from '../../domain/entities/Statement.js';
import { Transaction } from '../../domain/entities/Transaction.js';
import { VerificationReportDTO } from '../dto/VerificationReportDTO.js';

export interface StoragePort {
  upsertAccount(account: Account): Promise<void>;
  bulkUpsertTransactions(transactions: Transaction[]): Promise<void>;
  saveStatement(statement: Statement): Promise<void>;
  saveVerificationReport(report: VerificationReportDTO): Promise<void>;
  loadStatement(statementId: string): Promise<Statement | null>;
  loadLatestAccountSnapshot(accountId: string): Promise<Account | null>;
  loadTransactions(accountId: string, params: { startDate?: string; endDate?: string }): Promise<Transaction[]>;
  loadAdviceContext(userId: string): Promise<{ accounts: Account[]; transactions: Transaction[] }>;
  saveAdviceRecommendations(advice: AdviceRecommendation[]): Promise<void>;
  listStatements(userId: string): Promise<Statement[]>;
  deleteStatement(statementId: string): Promise<void>;
}
