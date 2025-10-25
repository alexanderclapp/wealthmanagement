export interface AppConfig {
  boundaryML: {
    apiKey: string;
    environment: 'sandbox' | 'production';
    baseUrl?: string;
    enabled: boolean;
  };
  plaid: {
    clientId?: string;
    secret?: string;
    environment: 'sandbox' | 'development' | 'production';
  };
  app: {
    baseCurrency: string;
  };
}

export const loadConfig = (): AppConfig => {
  const env = process.env;

  return {
    boundaryML: {
      apiKey: env.BOUNDARY_ML_API_KEY ?? '',
      environment: (env.BOUNDARY_ML_ENV ?? 'sandbox') as 'sandbox' | 'production',
      baseUrl: env.BOUNDARY_ML_BASE_URL,
      enabled: env.BOUNDARY_ML_ENABLED !== 'false',
    },
    plaid: {
      clientId: env.PLAID_CLIENT_ID,
      secret: env.PLAID_SECRET,
      environment: (env.PLAID_ENVIRONMENT ?? 'sandbox') as 'sandbox' | 'development' | 'production',
    },
    app: {
      baseCurrency: env.APP_BASE_CURRENCY ?? 'USD',
    },
  };
};
