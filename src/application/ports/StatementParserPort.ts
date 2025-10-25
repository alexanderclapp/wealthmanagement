import { ParsedStatementDTO } from '../dto/ParsedStatementDTO.js';

export interface StatementParserPort {
  parse(
    rawStatement: Buffer,
    options: {
      statementId: string;
      accountIdHint?: string;
      institutionId?: string;
      password?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ParsedStatementDTO>;
}
