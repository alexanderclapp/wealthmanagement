import cors from 'cors';
import dayjs from 'dayjs';
import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppContainer } from './infrastructure/bootstrap/AppContainer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 4000);
const container = new AppContainer();
const userAccessTokens = new Map<string, string>();

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json({ limit: '2mb' }));

const frontendPath = path.join(__dirname, '../apps/web/dist');
app.use(express.static(frontendPath));

const ensureUserId = (userId?: string): string => {
  if (!userId) {
    throw new Error('userId is required');
  }

  return userId;
};

const requirePlaid = () => {
  if (!container.hasLivePlaid()) {
    throw new Error('Plaid credentials are not configured. Set PLAID_CLIENT_ID and PLAID_SECRET to enable Plaid.');
  }
};

const buildFinancialSummary = async (userId: string) => {
  const { accounts, transactions } = await container.storage.loadAdviceContext(userId);

  const snapshots = accounts.map((account) => ({
    accountId: account.id,
    name: account.name,
    type: account.type,
    balance: account.balance,
    currency: account.currency,
  }));

  const monthlyBuckets = new Map<string, { inflows: number; outflows: number }>();

  transactions.forEach((txn) => {
    const monthKey = dayjs(txn.postedDate).format('YYYY-MM');
    const bucket = monthlyBuckets.get(monthKey) ?? { inflows: 0, outflows: 0 };

    if (txn.amount >= 0) {
      bucket.inflows += txn.amount;
    } else {
      bucket.outflows += Math.abs(txn.amount);
    }

    monthlyBuckets.set(monthKey, bucket);
  });

  const cashflow = Array.from(monthlyBuckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-6)
    .map(([monthKey, totals]) => ({
      month: dayjs(`${monthKey}-01`).format('MMM YYYY'),
      inflows: Math.round(totals.inflows),
      outflows: Math.round(totals.outflows),
      net: Math.round(totals.inflows - totals.outflows),
    }));

  const categoryTotals = new Map<string, number>();

  transactions.forEach((txn) => {
    if (txn.amount >= 0) {
      return;
    }

    const category = txn.category ?? 'Uncategorized';
    const current = categoryTotals.get(category) ?? 0;
    categoryTotals.set(category, current + Math.abs(txn.amount));
  });

  const categories = Array.from(categoryTotals.entries())
    .map(([category, amount]) => ({
      category,
      amount: Math.round(amount),
    }))
    .sort((a, b) => b.amount - a.amount);

  const recentTransactions = transactions.slice(-100); // Last 100 transactions

  return {
    accounts: snapshots,
    cashflow,
    categories,
    transactions: recentTransactions.map((txn) => ({
      id: txn.id,
      accountId: txn.accountId,
      postedDate: txn.postedDate,
      description: txn.description,
      amount: txn.amount,
      currency: txn.currency,
      category: txn.category,
    })),
    lastUpdated: new Date().toISOString(),
  };
};

app.get('/api/health', (req, res) => {
  res.json({
    name: 'Wealth Management API',
    version: '0.1.0',
    plaidConfigured: container.hasLivePlaid(),
    baseCurrency: container.config.app.baseCurrency,
  });
});

app.post('/api/plaid/link-token', async (req, res) => {
  try {
    requirePlaid();
    const userId = ensureUserId(req.body.userId);
    const { linkToken } = await container.aggregator.createLinkToken({
      userId,
      clientName: 'Wealth Management Portal',
      products: ['transactions'],
    });

    res.json({ linkToken });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create Plaid link token';
    res.status(message.includes('Plaid credentials') ? 503 : 400).json({ error: message });
  }
});

app.post('/api/plaid/exchange', async (req, res) => {
  try {
    requirePlaid();
    const userId = ensureUserId(req.body.userId);
    const publicToken: string | undefined = req.body.publicToken;

    if (!publicToken) {
      return res.status(400).json({ error: 'publicToken is required' });
    }

    const exchange = await container.aggregator.exchangePublicToken(publicToken);
    userAccessTokens.set(userId, exchange.accessToken);

    const startDate = dayjs().subtract(90, 'day').format('YYYY-MM-DD');
    const endDate = dayjs().format('YYYY-MM-DD');

    await container.syncService.sync({
      accessToken: exchange.accessToken,
      startDate,
      endDate,
      baseCurrency: container.config.app.baseCurrency,
      userId,
    });

    const summary = await buildFinancialSummary(userId);
    res.json({ itemId: exchange.itemId, summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to exchange public token';
    res.status(500).json({ error: message });
  }
});

app.post('/api/plaid/sync', async (req, res) => {
  try {
    requirePlaid();
    const userId = ensureUserId(req.body.userId);
    const accessToken = userAccessTokens.get(userId);

    if (!accessToken) {
      return res.status(404).json({ error: 'No access token stored for this user.' });
    }

    const startDate = dayjs().subtract(30, 'day').format('YYYY-MM-DD');
    const endDate = dayjs().format('YYYY-MM-DD');

    await container.syncService.sync({
      accessToken,
      startDate,
      endDate,
      baseCurrency: container.config.app.baseCurrency,
      userId,
    });

    const summary = await buildFinancialSummary(userId);
    res.json({ summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to sync Plaid data';
    res.status(500).json({ error: message });
  }
});

app.get('/api/financial-state', async (req, res) => {
  try {
    const userId = ensureUserId(req.query.userId as string | undefined);
    const summary = await buildFinancialSummary(userId);
    res.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to load financial summary';
    res.status(400).json({ error: message });
  }
});

app.post('/api/ingest', async (req, res) => {
  try {
    const { statementId, structuredData, baseCurrency } = req.body;

    if (!statementId || !structuredData) {
      return res.status(400).json({
        error: 'Missing required fields: statementId, structuredData',
      });
    }

    const ingestionResult = await container.ingestionService.ingestStatement({
      statementId,
      rawStatement: Buffer.from('mock-pdf'),
      parserOptions: {
        metadata: {
          structuredData,
        },
      },
      baseCurrency: baseCurrency || container.config.app.baseCurrency,
    });

    res.json({
      statementId,
      verificationStatus: ingestionResult.verificationStatus,
      transactionsProcessed: ingestionResult.statement.transactions.length,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to ingest statement';
    res.status(500).json({ error: message });
  }
});

app.get('/api/advice/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const advice = await container.adviceService.generateAdvice(userId);

    res.json({
      userId,
      adviceCount: advice.length,
      recommendations: advice.map((item) => ({
        id: item.id,
        type: item.type,
        title: item.title,
        summary: item.summary,
        rationale: item.rationale,
        impactEstimate: item.impactEstimate,
        createdAt: item.createdAt,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate advice';
    res.status(500).json({ error: message });
  }
});

app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  return res.sendFile(path.join(frontendPath, 'index.html'), (err) => {
    if (err) {
      next(err);
    }
  });
});

app.listen(port, () => {
  console.log(`🚀 Wealth Management API listening on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`🎯 Plaid configured: ${container.hasLivePlaid()}`);
});
