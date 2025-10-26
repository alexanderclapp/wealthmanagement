# Wealth Management Ingestion & Advice Platform

This project provides a hexagonal (ports-and-adapters) TypeScript implementation for ingesting wealth management data from PDF statements or bank aggregators such as Plaid, validating the data with BoundaryML, and producing financial advice recommendations.

## Highlights

- **Domain-centric** design: core entities (`Account`, `Transaction`, `Statement`, `AdviceRecommendation`) live in the domain layer and remain pure TypeScript.
- **Ports** describe all external interactions (`StatementParserPort`, `StoragePort`, `IngestionVerifierPort`, etc.), enabling easy adapter swaps.
- **BoundaryML integration**: handled by `BoundaryMLIngestionVerifier`, with optional fallback reconciliation checks when the API is unavailable.
- **Deduplication**: transactions keyed via SHA-256 hash of `accountId|date|amount|normalized_desc|currency`.
- **Security posture**: secrets are sourced from environment variables (`Config.ts`); logging avoids PII.
- **Testing strategy**: use schema validation with `zod` for DTOs; plug contract tests per adapter; add golden files for PDF parsers.

## Getting Started

1. Install dependencies:
   ```bash
   npm install
   ```
2. Configure environment variables in `.env` (create from `.env.example` if available):
   ```bash
   BOUNDARY_ML_API_KEY=your-key
   BOUNDARY_ML_ENV=sandbox
   PLAID_CLIENT_ID=your-plaid-client-id
   PLAID_SECRET=your-plaid-secret
   PLAID_ENVIRONMENT=sandbox
   APP_BASE_CURRENCY=USD
   VITE_API_BASE_URL=http://localhost:4000
   ```
3. Start the backend API (Express server with Plaid + ingestion endpoints):
   ```bash
   npm run dev
   ```
4. In another terminal, run the frontend:
   ```bash
   npm run web:install   # first time only
   npm run web:dev
   ```
   Visit http://localhost:5173. The client calls the backend (`VITE_API_BASE_URL`) for Plaid Link tokens, syncing, and financial summaries.

## Key Modules

- `src/domain`: domain entities and value services (`TransactionHasher`, `DescriptionNormalizer`).
- `src/application/dto`: DTOs with Zod schemas ensuring contract fidelity.
- `src/application/services`: orchestration services for ingestion, sync, and advice.
- `src/infrastructure/adapters`:
  - `parser/PdfStatementParser`: expects structured metadata or plug in a PDF extraction pipeline.
  - `validation/BoundaryMLIngestionVerifier`: integrates with BoundaryML API; falls back to deterministic checks.
  - `aggregator/PlaidBankAggregatorAdapter`: expects a Plaid client, with mock-mode for sandboxing.
  - `storage/InMemoryStorageAdapter`: replace with Postgres/DynamoDB adapter via `StoragePort`.
  - `categorizer/RuleBasedCategorizer`, `fx/CachedFxConverter`, `advice/RuleBasedAdviceEngine`: simple defaults ready to swap.
- `src/infrastructure/bootstrap/AppContainer`: assembles dependencies based on config and supports overrides for testing.

## Frontend (Vite + React)

The `apps/web` project provides a React-based client for three core flows:

1. **Upload & sync**: upload PDF statements (stubbed) or launch Plaid Link to synchronise live balances and transactions.
2. **Insights dashboard**: review cashflow trends, account balances, and category allocations rendered with Recharts.
3. **Advice assistant**: ask free-form questions; the demo responds with rule-driven recommendations derived from the synced data.

### Running the web client

```bash
npm run web:install   # installs frontend dependencies (once)
npm run web:dev       # starts Vite dev server on http://localhost:5173
```

Build and preview production assets:

```bash
npm run web:build
npm run web:preview
```

The React context at `apps/web/src/context/FinancialDataContext.tsx` now calls the Express API for financial summaries, Plaid link token creation, and transaction sync. When the API is unreachable the UI falls back to locally-generated sample data.

## Plaid Integration

1. Obtain a Plaid **Client ID** and **Secret** (sandbox values work for development).
2. Update `.env` with the credentials and environment, e.g.:
   ```bash
   PLAID_CLIENT_ID=68fe51493089da001f9661fd
   PLAID_SECRET=2882b46dbb8e1ec0510bd143c09f22
   PLAID_ENVIRONMENT=sandbox
   ```
3. Ensure `VITE_API_BASE_URL` points to the backend server (default `http://localhost:4000`).
4. Restart `npm run dev` so the server rebuilds with the new configuration.
5. In the web client, click **Connect with Plaid**. The backend issues a link token, exchanges the public token, triggers a `SyncService` pull, and returns a refreshed financial summary to the dashboard.

If Plaid credentials are missing, the server responds with HTTP 503 and the UI displays the error message.

## Next Steps

- Implement production-ready adapters:
  - Hook in PDF parsing (e.g., `pdf-lib` + layout templates).
  - Connect real Plaid client and persist data in PostgreSQL.
  - Use BoundaryML SDK’s official client for validation.
- Expand advice rules and analytics (cash flow trends, investment diversification).
- Add automated tests (unit tests for services, contract tests for adapters, end-to-end ingestion scenarios).
- Introduce HTTP APIs (REST/gRPC) and message queue (for async ingestion) around the application services.

## Deploying to Heroku

1. Ensure the TypeScript build succeeds locally:
   ```bash
   npm install
   npm run build
   ```
2. Create a Heroku app (once per environment):
   ```bash
   heroku create wealth-management-app
   ```
3. Provision required config vars and secrets:
   ```bash
   heroku config:set \
     BOUNDARY_ML_API_KEY=your-key \
     BOUNDARY_ML_ENV=production \
     PLAID_CLIENT_ID=your-client-id \
     PLAID_SECRET=your-secret \
     PLAID_ENVIRONMENT=production \
     APP_BASE_CURRENCY=USD
   ```
4. Push the repository:
   ```bash
   heroku git:remote -a wealth-management-app
   git push heroku main
   ```
5. Scale the web dyno:
   ```bash
   heroku ps:scale web=1
   ```
6. Tail logs to verify ingestion/advice jobs:
   ```bash
   heroku logs --tail
   ```

The `Procfile` configures Heroku to run `npm start`, which executes the compiled API in `dist/server.js`. The `heroku-postbuild` script builds both the backend and the React frontend so static assets can be served directly from the same dyno.
