import { ParsedStatementDTO } from '../dto/ParsedStatementDTO.js';
import { VerificationReportDTO } from '../dto/VerificationReportDTO.js';
import { IngestionVerifierPort } from '../ports/IngestionVerifierPort.js';
import { StoragePort } from '../ports/StoragePort.js';

export class IngestionValidationService {
  constructor(
    private readonly verifier: IngestionVerifierPort,
    private readonly storage: StoragePort,
  ) {}

  async validate(statement: ParsedStatementDTO, statementId: string): Promise<VerificationReportDTO> {
    const report = await this.verifier.validate(statement, {
      statementId,
      source: statement.source,
      metadata: statement.metadata,
    });

    await this.storage.saveVerificationReport(report);

    // Only fail on actual ERRORs, allow REVIEW (warnings) and PASS to proceed
    if (report.status === 'FAIL') {
      const errorIssues = report.issues.filter(i => i.severity === 'ERROR');
      if (errorIssues.length > 0) {
        throw new Error(`Statement ${statementId} failed verification: ${errorIssues.map((i) => i.code).join(', ')}`);
      }
    }

    // Log warnings if present
    const warnings = report.issues.filter(i => i.severity === 'WARNING');
    if (warnings.length > 0) {
      console.log(`⚠️ Statement ${statementId} has warnings: ${warnings.map(w => w.code).join(', ')}`);
    }

    return report;
  }
}
