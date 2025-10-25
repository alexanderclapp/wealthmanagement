import { ParsedStatementDTO, ParsedStatementSchema } from '../../../application/dto/ParsedStatementDTO.js';
import { StatementParserPort } from '../../../application/ports/StatementParserPort.js';

export interface PdfStatementParserOptions {
  allowStructuredFallback?: boolean;
}

export class PdfStatementParser implements StatementParserPort {
  constructor(private readonly options: PdfStatementParserOptions = { allowStructuredFallback: true }) {}

  async parse(
    _rawStatement: Buffer,
    options: {
      statementId: string;
      accountIdHint?: string;
      institutionId?: string;
      password?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ParsedStatementDTO> {
    if (this.options.allowStructuredFallback) {
      const structured = options.metadata?.structuredData;
      if (structured) {
        return ParsedStatementSchema.parse(structured);
      }
    }

    throw new Error(
      'PDF parsing is not implemented in this environment. Provide structuredData metadata for integration tests.',
    );
  }
}
