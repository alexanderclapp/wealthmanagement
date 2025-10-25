import { AppContainer } from './infrastructure/bootstrap/AppContainer.js';

const run = async () => {
  const container = new AppContainer();

  const sampleStructuredStatement = {
    account: {
      externalId: 'acct-ext-123',
      accountId: 'acct-001',
      institutionId: 'inst-001',
      name: 'Wealth Checking',
      type: 'CHECKING',
      currency: 'USD',
    },
    period: {
      start: '2024-01-01',
      end: '2024-01-31',
    },
    openingBalance: 1500,
    closingBalance: 3810,
    transactions: [
      {
        externalId: 'txn-001',
        accountId: 'acct-001',
        postedDate: '2024-01-15',
        description: 'Payroll ACME Corp',
        amount: 2500,
        currency: 'USD',
        metadata: { originalDescription: 'PAYROLL ACME CORP 1234' },
      },
      {
        externalId: 'txn-002',
        accountId: 'acct-001',
        postedDate: '2024-01-20',
        description: 'Grocery Store',
        amount: -190,
        currency: 'USD',
      },
    ],
    currency: 'USD',
    source: 'PDF' as const,
    metadata: { userId: 'user-001' },
  };

  const ingestionResult = await container.ingestionService.ingestStatement({
    statementId: 'stmt-jan-2024',
    rawStatement: Buffer.from('mock-pdf'),
    parserOptions: {
      metadata: {
        structuredData: sampleStructuredStatement,
      },
    },
    baseCurrency: container.config.app.baseCurrency,
  });

  console.log('Ingestion result:', ingestionResult.verificationStatus);

  const advice = await container.adviceService.generateAdvice('user-001');
  console.log(`Advice generated (${advice.length}):`);
  advice.forEach((item) => console.log(`- ${item.title}: ${item.summary}`));
};

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
