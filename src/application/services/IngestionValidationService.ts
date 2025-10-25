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

    if (report.status === 'FAIL') {
      throw new Error(`Statement ${statementId} failed verification: ${report.issues.map((i) => i.code).join(', ')}`);
    }

    return report;
  }
}
