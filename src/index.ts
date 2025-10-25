import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { AppContainer } from './infrastructure/bootstrap/AppContainer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const container = new AppContainer();

app.use(express.json());

// Serve static files from the frontend build
const frontendPath = path.join(__dirname, '../apps/web/dist');
app.use(express.static(frontendPath));

// Health check / welcome page
app.get('/', (req, res) => {
  res.json({
    name: 'Wealth Management Ingestion & Advice Platform',
    version: '0.1.0',
    status: 'running',
    endpoints: {
      health: 'GET /',
      demo: 'GET /api/demo',
      ingest: 'POST /api/ingest',
      advice: 'GET /api/advice/:userId',
    },
  });
});

// Demo endpoint - runs the example ingestion and advice generation
app.get('/api/demo', async (req, res) => {
  try {
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

    const advice = await container.adviceService.generateAdvice('user-001');

    res.json({
      success: true,
      ingestion: {
        statementId: 'stmt-jan-2024',
        verificationStatus: ingestionResult.verificationStatus,
        transactionsProcessed: ingestionResult.statement.transactions.length,
      },
      advice: {
        count: advice.length,
        recommendations: advice.map((item) => ({
          id: item.id,
          type: item.type,
          title: item.title,
          summary: item.summary,
          rationale: item.rationale,
          impactEstimate: item.impactEstimate,
          createdAt: item.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Ingest statement endpoint
app.post('/api/ingest', async (req, res) => {
  try {
    const { statementId, structuredData, baseCurrency } = req.body;

    if (!statementId || !structuredData) {
      return res.status(400).json({
        success: false,
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
      success: true,
      statementId,
      verificationStatus: ingestionResult.verificationStatus,
      transactionsProcessed: ingestionResult.statement.transactions.length,
      transactions: ingestionResult.statement.transactions.map((t) => ({
        id: t.id,
        description: t.description,
        amount: t.amount,
        date: t.postedDate,
        category: t.category,
      })),
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Get advice for a user
app.get('/api/advice/:userId', async (req, res) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'Missing userId parameter',
      });
    }

    const advice = await container.adviceService.generateAdvice(userId);

    res.json({
      success: true,
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
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

// Serve the frontend for all non-API routes (SPA fallback)
app.get('*', (req, res, next) => {
  // Only serve index.html for non-API routes
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({
      success: false,
      error: 'API endpoint not found',
      availableEndpoints: {
        demo: 'GET /api/demo',
        ingest: 'POST /api/ingest',
        advice: 'GET /api/advice/:userId',
      },
    });
  }
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// Start the server
app.listen(port, () => {
  console.log(`🚀 Wealth Management API listening on port ${port}`);
  console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`💰 Base currency: ${container.config.app.baseCurrency}`);
});
