import { Configuration, PlaidApi, PlaidEnvironments } from 'plaid';
import { IngestionService } from '../../application/services/IngestionService.js';
import { IngestionValidationService } from '../../application/services/IngestionValidationService.js';
import { SyncService } from '../../application/services/SyncService.js';
import { AdviceService } from '../../application/services/AdviceService.js';
import { StatementParserPort } from '../../application/ports/StatementParserPort.js';
import { StoragePort } from '../../application/ports/StoragePort.js';
import { CategorizerPort } from '../../application/ports/CategorizerPort.js';
import { FXConverterPort } from '../../application/ports/FXConverterPort.js';
import { BankAggregatorPort } from '../../application/ports/BankAggregatorPort.js';
import { AdviceEnginePort } from '../../application/ports/AdviceEnginePort.js';
import { IngestionVerifierPort } from '../../application/ports/IngestionVerifierPort.js';
import { PdfStatementParser } from '../adapters/parser/PdfStatementParser.js';
import { InMemoryStorageAdapter } from '../adapters/storage/InMemoryStorageAdapter.js';
import { RuleBasedCategorizer } from '../adapters/categorizer/RuleBasedCategorizer.js';
import { CachedFxConverter } from '../adapters/fx/CachedFxConverter.js';
import { PlaidBankAggregatorAdapter } from '../adapters/aggregator/PlaidBankAggregatorAdapter.js';
import { RuleBasedAdviceEngine } from '../adapters/advice/RuleBasedAdviceEngine.js';
import { BoundaryMLIngestionVerifier } from '../adapters/validation/BoundaryMLIngestionVerifier.js';
import { loadConfig } from '../config/Config.js';
import { fetchTransport } from '../http/FetchTransport.js';

export interface AppContainerOverrides {
  parser?: StatementParserPort;
  storage?: StoragePort;
  categorizer?: CategorizerPort;
  fxConverter?: FXConverterPort;
  aggregator?: BankAggregatorPort;
  adviceEngine?: AdviceEnginePort;
  ingestionVerifier?: IngestionVerifierPort;
}

export class AppContainer {
  readonly config = loadConfig();
  private readonly plaidLive: boolean;

  readonly parser: StatementParserPort;
  readonly storage: StoragePort;
  readonly categorizer: CategorizerPort;
  readonly fxConverter: FXConverterPort;
  readonly aggregator: BankAggregatorPort;
  readonly ingestionVerifier: IngestionVerifierPort;
  readonly ingestionValidation: IngestionValidationService;
  readonly ingestionService: IngestionService;
  readonly syncService: SyncService;
  readonly adviceEngine: AdviceEnginePort;
  readonly adviceService: AdviceService;

  constructor(overrides: AppContainerOverrides = {}) {
    this.parser = overrides.parser ?? new PdfStatementParser();
    this.storage = overrides.storage ?? new InMemoryStorageAdapter();
    this.categorizer = overrides.categorizer ?? new RuleBasedCategorizer();
    this.fxConverter = overrides.fxConverter ?? new CachedFxConverter();
    this.adviceEngine = overrides.adviceEngine ?? new RuleBasedAdviceEngine();

    if (overrides.aggregator) {
      this.aggregator = overrides.aggregator;
      this.plaidLive =
        overrides.aggregator instanceof PlaidBankAggregatorAdapter ? overrides.aggregator.isLive() : false;
    } else {
      const plaidConfig = this.config.plaid;

      if (plaidConfig.clientId && plaidConfig.secret) {
        const configuration = new Configuration({
          basePath: PlaidEnvironments[plaidConfig.environment],
          baseOptions: {
            headers: {
              'PLAID-CLIENT-ID': plaidConfig.clientId,
              'PLAID-SECRET': plaidConfig.secret,
            },
          },
        });

        const plaidClient = new PlaidApi(configuration);
        const adapter = new PlaidBankAggregatorAdapter(plaidClient);
        this.aggregator = adapter;
        this.plaidLive = adapter.isLive();
      } else {
        const adapter = new PlaidBankAggregatorAdapter(null, {
          mockData: { accounts: [], transactions: [] },
        });
        this.aggregator = adapter;
        this.plaidLive = false;
      }
    }

    const boundaryConfig = this.config.boundaryML;

    this.ingestionVerifier =
      overrides.ingestionVerifier ??
      new BoundaryMLIngestionVerifier(
        {
          apiKey: boundaryConfig.apiKey,
          environment: boundaryConfig.environment === 'production' ? 'production' : 'sandbox',
          baseUrl: boundaryConfig.baseUrl,
          enableFallbackChecks: true,
        },
        boundaryConfig.enabled && boundaryConfig.apiKey ? fetchTransport : undefined,
      );

    this.ingestionValidation = new IngestionValidationService(this.ingestionVerifier, this.storage);
    this.ingestionService = new IngestionService(
      this.parser,
      this.storage,
      this.categorizer,
      this.fxConverter,
      this.ingestionValidation,
    );

    this.syncService = new SyncService(this.aggregator, this.storage, this.categorizer, this.fxConverter);
    this.adviceService = new AdviceService(this.storage, this.adviceEngine);
  }

  hasLivePlaid(): boolean {
    return this.plaidLive;
  }
}
