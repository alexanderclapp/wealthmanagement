import { ParsedStatementDTO } from '../dto/ParsedStatementDTO.js';
import { VerificationReportDTO } from '../dto/VerificationReportDTO.js';

export interface IngestionVerifierPort {
  validate(
    statement: ParsedStatementDTO,
    options: { statementId: string; source: 'PDF' | 'AGGREGATOR'; metadata?: Record<string, unknown> },
  ): Promise<VerificationReportDTO>;
}
