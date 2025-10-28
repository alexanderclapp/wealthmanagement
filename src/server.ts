import cors from 'cors';
import dayjs from 'dayjs';
import express from 'express';
import multer from 'multer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AppContainer } from './infrastructure/bootstrap/AppContainer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = Number(process.env.PORT ?? 4000);
const container = new AppContainer();
const userAccessTokens = new Map<string, string>();

// Configure multer for file uploads (store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed'));
    }
  },
});

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

app.post('/api/ingest', upload.single('statement'), async (req, res) => {
  try {
    const userId = ensureUserId(req.body.userId);

    if (!req.file) {
      return res.status(400).json({
        error: 'No PDF file provided. Please upload a statement.',
      });
    }

    const statementId = `stmt-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const ingestionResult = await container.ingestionService.ingestStatement({
      statementId,
      rawStatement: req.file.buffer,
      parserOptions: {
        accountIdHint: req.body.accountIdHint,
        institutionId: req.body.institutionId,
        metadata: {
          userId,
          fileName: req.file.originalname,
          uploadedAt: new Date().toISOString(),
        },
      },
      baseCurrency: req.body.baseCurrency || container.config.app.baseCurrency,
    });

    console.log('✅ PDF ingested successfully:', {
      userId,
      accountId: ingestionResult.statement.account.id,
      accountMetadata: ingestionResult.statement.account.metadata,
      transactionsProcessed: ingestionResult.statement.transactions.length,
    });

    // Return updated financial summary
    const summary = await buildFinancialSummary(userId);

    console.log('📊 Summary generated:', {
      userId,
      accounts: summary.accounts.length,
      transactions: summary.transactions.length,
    });

    res.json({
      success: true,
      statementId,
      verificationStatus: ingestionResult.verificationStatus,
      transactionsProcessed: ingestionResult.statement.transactions.length,
      summary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to ingest statement';
    console.error('PDF ingestion error:', error);
    res.status(500).json({ error: message });
  }
});

app.post('/api/advice/ask', async (req, res) => {
  try {
    const userId = ensureUserId(req.body.userId);
    const question = req.body.question as string;

    if (!question || typeof question !== 'string') {
      return res.status(400).json({ error: 'Question is required' });
    }

    console.log(`🤔 User ${userId} asked: "${question}"`);

    // Load user's financial context
    const { accounts, transactions } = await container.storage.loadAdviceContext(userId);

    // Calculate category breakdown
    const categoryTotals = new Map<string, number>();
    let totalExpenses = 0;
    transactions
      .filter((txn) => txn.amount < 0)
      .forEach((txn) => {
        const category = txn.category ?? 'Uncategorized';
        const amount = Math.abs(txn.amount);
        categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
        totalExpenses += amount;
      });

    const categoryBreakdown = Array.from(categoryTotals.entries())
      .map(([category, total]) => ({
        category,
        total: Math.round(total),
        percentage: (total / totalExpenses) * 100,
      }))
      .sort((a, b) => b.total - a.total);

    // Prepare context
    const incomePerMonth = transactions
      .filter((txn) => txn.amount > 0)
      .reduce((sum, txn) => sum + txn.amount, 0) / Math.max(1, new Set(transactions.map(t => dayjs(t.postedDate).format('YYYY-MM'))).size);

    const expensesPerMonth = Math.abs(
      transactions
        .filter((txn) => txn.amount < 0)
        .reduce((sum, txn) => sum + txn.amount, 0) / Math.max(1, new Set(transactions.map(t => dayjs(t.postedDate).format('YYYY-MM'))).size)
    );

    const context = {
      userId,
      accounts: accounts.map((acc) => ({
        accountId: acc.id,
        balance: acc.balance,
        currency: acc.currency,
        type: acc.type,
      })),
      incomePerMonth: Math.round(incomePerMonth),
      expensesPerMonth: Math.round(expensesPerMonth),
      netWorth: accounts.reduce((total, acc) => total + acc.balance, 0),
    };

    const recentTransactions = transactions
      .slice(-10)
      .map((txn) => ({
        date: dayjs(txn.postedDate).format('MMM D'),
        description: txn.description,
        amount: txn.amount,
        category: txn.category,
      }));

    // Get LLM answer
    const answer = await container.adviceEngine.answerQuestion({
      question,
      context,
      categoryBreakdown,
      recentTransactions,
    });

    console.log(`✅ Answer generated for ${userId}`);

    res.json({
      success: true,
      answer,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to generate advice';
    console.error('Advice generation error:', error);
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
