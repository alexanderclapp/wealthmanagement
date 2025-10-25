import { ExternalAccountDTO, ExternalTransactionDTO } from '../dto/ExternalAccountDTO.js';

export interface BankAggregatorPort {
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  fetchAccounts(accessToken: string): Promise<ExternalAccountDTO[]>;
  fetchTransactions(
    accessToken: string,
    params: { accountId: string; startDate: string; endDate: string },
  ): Promise<ExternalTransactionDTO[]>;
}
