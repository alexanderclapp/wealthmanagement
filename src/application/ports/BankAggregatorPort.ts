import { ExternalAccountDTO, ExternalTransactionDTO } from '../dto/ExternalAccountDTO.js';

export interface BankAggregatorPort {
  createLinkToken(params: {
    userId: string;
    clientName: string;
    products?: string[];
    webhook?: string;
    redirectUri?: string;
  }): Promise<{ linkToken: string }>;
  exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }>;
  fetchAccounts(accessToken: string): Promise<ExternalAccountDTO[]>;
  fetchTransactions(
    accessToken: string,
    params: { accountId: string; startDate: string; endDate: string },
  ): Promise<ExternalTransactionDTO[]>;
}
