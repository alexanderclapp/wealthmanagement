import { ExternalAccountDTO, ExternalTransactionDTO } from '../../../application/dto/ExternalAccountDTO.js';
import { BankAggregatorPort } from '../../../application/ports/BankAggregatorPort.js';

type PlaidClient = {
  itemPublicTokenExchange(request: { public_token: string }): Promise<{ data: { access_token: string; item_id: string } }>;
  accountsGet(request: { access_token: string }): Promise<{
    data: {
      accounts: Array<{
        account_id: string;
        name: string;
        official_name?: string;
        mask?: string;
        subtype?: string;
        type: string;
        balances: { current?: number; available?: number; iso_currency_code?: string; last_updated_datetime?: string };
        institution_id?: string;
      }>;
    };
  }>;
  transactionsGet(request: {
    access_token: string;
    start_date: string;
    end_date: string;
    options?: { account_ids?: string[] };
  }): Promise<{
    data: {
      transactions: Array<{
        transaction_id: string;
        account_id: string;
        name: string;
        merchant_name?: string;
        amount: number;
        iso_currency_code?: string;
        date: string;
        category?: string[];
      }>;
    };
  }>;
};

interface PlaidAggregatorConfig {
  institutionId?: string;
  mockData?: {
    accounts: ExternalAccountDTO[];
    transactions: ExternalTransactionDTO[];
  };
}

export class PlaidBankAggregatorAdapter implements BankAggregatorPort {
  constructor(
    private readonly client: PlaidClient | null,
    private readonly config: PlaidAggregatorConfig = {},
  ) {}

  async exchangePublicToken(publicToken: string): Promise<{ accessToken: string; itemId: string }> {
    if (!this.client) {
      if (this.config.mockData) {
        return { accessToken: 'mock-access-token', itemId: 'mock-item-id' };
      }

      throw new Error('Plaid client not configured. Provide mockData for offline mode.');
    }

    const response = await this.client.itemPublicTokenExchange({ public_token: publicToken });
    return { accessToken: response.data.access_token, itemId: response.data.item_id };
  }

  async fetchAccounts(accessToken: string): Promise<ExternalAccountDTO[]> {
    if (!this.client) {
      if (this.config.mockData) {
        return this.config.mockData.accounts;
      }

      throw new Error('Plaid client not configured. Provide mockData for offline mode.');
    }

    const response = await this.client.accountsGet({ access_token: accessToken });

    return response.data.accounts.map((account) => ({
      id: account.account_id,
      institutionId: account.institution_id ?? this.config.institutionId ?? 'plaid',
      name: account.official_name ?? account.name,
      mask: account.mask,
      type: account.type,
      subtype: account.subtype,
      currency: account.balances.iso_currency_code ?? 'USD',
      balance: account.balances.current ?? 0,
      availableBalance: account.balances.available ?? undefined,
      asOf: account.balances.last_updated_datetime ?? new Date().toISOString(),
      metadata: {},
    }));
  }

  async fetchTransactions(
    accessToken: string,
    params: { accountId: string; startDate: string; endDate: string },
  ): Promise<ExternalTransactionDTO[]> {
    if (!this.client) {
      if (this.config.mockData) {
        return this.config.mockData.transactions.filter(
          (txn) => txn.accountId === params.accountId && txn.postedAt >= params.startDate && txn.postedAt <= params.endDate,
        );
      }

      throw new Error('Plaid client not configured. Provide mockData for offline mode.');
    }

    const response = await this.client.transactionsGet({
      access_token: accessToken,
      start_date: params.startDate,
      end_date: params.endDate,
      options: { account_ids: [params.accountId] },
    });

    return response.data.transactions.map((txn) => ({
      id: txn.transaction_id,
      accountId: txn.account_id,
      description: txn.name,
      merchantName: txn.merchant_name,
      amount: txn.amount * -1, // Plaid uses positive for debits, convert to signed domain convention.
      currency: txn.iso_currency_code ?? 'USD',
      postedAt: txn.date,
      category: txn.category?.[0],
      metadata: { plaidCategory: txn.category },
    }));
  }
}
