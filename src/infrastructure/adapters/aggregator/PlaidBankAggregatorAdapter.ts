import type { PlaidApi } from 'plaid';
import { CountryCode, Products } from 'plaid';
import { ExternalAccountDTO, ExternalTransactionDTO } from '../../../application/dto/ExternalAccountDTO.js';
import { BankAggregatorPort } from '../../../application/ports/BankAggregatorPort.js';

interface PlaidAggregatorConfig {
  institutionId?: string;
  mockData?: {
    accounts: ExternalAccountDTO[];
    transactions: ExternalTransactionDTO[];
  };
}

export class PlaidBankAggregatorAdapter implements BankAggregatorPort {
  constructor(
    private readonly client: PlaidApi | null,
    private readonly config: PlaidAggregatorConfig = {},
  ) {}

  isLive(): boolean {
    return Boolean(this.client);
  }

  async createLinkToken(params: {
    userId: string;
    clientName: string;
    products?: string[];
    webhook?: string;
    redirectUri?: string;
  }): Promise<{ linkToken: string }> {
    if (!this.client) {
      throw new Error('Plaid client not configured. Set PLAID credentials to enable link tokens.');
    }

    const productMap: Record<string, Products> = {
      transactions: Products.Transactions,
      auth: Products.Auth,
      liabilities: Products.Liabilities,
      investments: Products.Investments,
      assets: Products.Assets,
    };

    const requestedProducts =
      params.products?.map((product) => productMap[product.toLowerCase()] ?? Products.Transactions) ??
      [Products.Transactions];

    const response = await this.client.linkTokenCreate({
      user: { client_user_id: params.userId },
      client_name: params.clientName,
      products: requestedProducts,
      language: 'en',
      country_codes: [CountryCode.Us],
      webhook: params.webhook,
      redirect_uri: params.redirectUri,
    });

    return { linkToken: response.data.link_token };
  }

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

      throw new Error('Plaid client not configured. Set PLAID credentials to enable aggregation.');
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

      throw new Error('Plaid client not configured. Set PLAID credentials to enable aggregation.');
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
