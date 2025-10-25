import { IngestionVerifierPort } from '../../../application/ports/IngestionVerifierPort.js';
import { ParsedStatementDTO } from '../../../application/dto/ParsedStatementDTO.js';
import {
  VerificationIssueDTO,
  VerificationReportDTO,
} from '../../../application/dto/VerificationReportDTO.js';

type Transport = (input: {
  url: string;
  method: 'POST';
  headers: Record<string, string>;
  body: string;
}) => Promise<{ status: number; body: unknown }>;

export interface BoundaryMLConfig {
  apiKey: string;
  environment: 'sandbox' | 'production';
  baseUrl?: string;
  timeoutMs?: number;
  enableFallbackChecks?: boolean;
}

export class BoundaryMLIngestionVerifier implements IngestionVerifierPort {
  private readonly baseUrl: string;

  constructor(
    private readonly config: BoundaryMLConfig,
    private readonly transport?: Transport,
  ) {
    this.baseUrl =
      config.baseUrl ??
      (config.environment === 'production'
        ? 'https://api.boundaryml.com'
        : 'https://sandbox.boundaryml.com');
  }

  async validate(
    statement: ParsedStatementDTO,
    options: { statementId: string; source: 'PDF' | 'AGGREGATOR'; metadata?: Record<string, unknown> },
  ): Promise<VerificationReportDTO> {
    if (this.transport) {
      const report = await this.invokeBoundary(statement, options);

      if (report) {
        return report;
      }
    }

    if (this.config.enableFallbackChecks) {
      return this.runFallbackChecks(statement, options.statementId);
    }

    return {
      statementId: options.statementId,
      status: 'PENDING',
      confidence: 0,
      issues: [],
      source: 'boundaryml-fallback',
      executedAt: new Date().toISOString(),
      metadata: { reason: 'boundaryml_unavailable' },
    };
  }

  private async invokeBoundary(
    statement: ParsedStatementDTO,
    options: { statementId: string; source: 'PDF' | 'AGGREGATOR'; metadata?: Record<string, unknown> },
  ): Promise<VerificationReportDTO | null> {
    const payload = {
      statementId: options.statementId,
      source: options.source,
      statement,
      metadata: options.metadata,
    };

    try {
      const response = await this.transport!({
        url: `${this.baseUrl}/v1/ingestion/verify`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (response.status >= 200 && response.status < 300) {
        const data = response.body as VerificationReportDTO;
        return data;
      }
    } catch (error) {
      console.warn('BoundaryML verification failed, falling back.', error);
    }

    return null;
  }

  private runFallbackChecks(statement: ParsedStatementDTO, statementId: string): VerificationReportDTO {
    const issues: VerificationIssueDTO[] = [];
    const executedAt = new Date().toISOString();

    const periodValid = new Date(statement.period.start) <= new Date(statement.period.end);
    if (!periodValid) {
      issues.push({
        code: 'period_invalid',
        message: 'Statement period start date is after the end date.',
        field: 'period',
        severity: 'ERROR',
      });
    }

    const totalActivity = statement.transactions.reduce((sum, txn) => sum + txn.amount, 0);
    const balanceDelta = statement.closingBalance - statement.openingBalance;
    const deltaTolerance = Math.abs(totalActivity - balanceDelta);
    if (deltaTolerance > 1) {
      issues.push({
        code: 'balance_mismatch',
        message: 'Transaction totals do not reconcile with balance delta.',
        field: 'closingBalance',
        severity: 'ERROR',
        remediation: 'Verify transactions list contains all entries and amounts are signed correctly.',
      });
    }

    const duplicateHashes = new Set<string>();
    statement.transactions.forEach((txn) => {
      const signature = `${txn.accountId}-${txn.postedDate}-${txn.amount}-${txn.currency}-${txn.description}`;
      if (duplicateHashes.has(signature)) {
        issues.push({
          code: 'duplicate_transaction',
          message: 'Duplicate transaction detected with identical details.',
          field: 'transactions',
          severity: 'WARNING',
          remediation: 'Confirm whether the statement includes repeated rows.',
        });
      } else {
        duplicateHashes.add(signature);
      }
    });

    const status = issues.some((issue) => issue.severity === 'ERROR') ? 'FAIL' : issues.length ? 'REVIEW' : 'PASS';

    return {
      statementId,
      status,
      confidence: status === 'PASS' ? 0.9 : status === 'REVIEW' ? 0.6 : 0.1,
      issues,
      source: 'boundaryml-fallback',
      executedAt,
      metadata: { fallback: true },
    };
  }
}
