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
2. Configure environment variables in `.env` (optional):
   ```bash
   BOUNDARY_ML_API_KEY=your-key
   BOUNDARY_ML_ENV=sandbox
   PLAID_CLIENT_ID=your-client-id
   PLAID_SECRET=your-secret
   APP_BASE_CURRENCY=USD
   ```
3. Run the example bootstrap:
   ```bash
   npm start
   ```

The example bootstrap (`src/index.ts`) uses structured metadata to simulate a parsed statement, routes it through ingestion and advice generation, and prints resulting recommendations.

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
     APP_BASE_CURRENCY=USD
   ```
4. Push the repository:
   ```bash
   heroku git:remote -a wealth-management-app
   git push heroku main
   ```
5. Scale the worker dyno (the app runs as a background worker):
   ```bash
   heroku ps:scale worker=1
   ```
6. Tail logs to verify ingestion/advice jobs:
   ```bash
   heroku logs --tail
   ```

The `Procfile` configures Heroku to run `npm start`, which executes the compiled Node entrypoint in `dist/index.js`. The `heroku-postbuild` script automatically compiles TypeScript during deployment.
