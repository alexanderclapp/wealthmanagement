import pdfParse from 'pdf-parse';
import { ParsedStatementDTO, ParsedStatementSchema, ParsedTransactionDTO } from '../../../application/dto/ParsedStatementDTO.js';
import { StatementParserPort } from '../../../application/ports/StatementParserPort.js';

export interface PdfStatementParserOptions {
  allowStructuredFallback?: boolean;
}

export class PdfStatementParser implements StatementParserPort {
  constructor(private readonly options: PdfStatementParserOptions = { allowStructuredFallback: true }) {}

  async parse(
    rawStatement: Buffer,
    options: {
      statementId: string;
      accountIdHint?: string;
      institutionId?: string;
      password?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ParsedStatementDTO> {
    // Fallback for structured data (for testing)
    if (this.options.allowStructuredFallback) {
      const structured = options.metadata?.structuredData;
      if (structured) {
        return ParsedStatementSchema.parse(structured);
      }
    }

    try {
      // Extract text from PDF
      // @ts-ignore - pdf-parse has incorrect type definitions
      const pdfData = await pdfParse(rawStatement);
      const text = pdfData.text;

      // Parse the PDF text, passing all options including metadata
      const parsedData = this.parseStatementText(text, {
        statementId: options.statementId,
        accountIdHint: options.accountIdHint,
        institutionId: options.institutionId,
        metadata: options.metadata,
      });

      console.log('📄 PDF parsed:', {
        accountId: parsedData.account.accountId,
        institution: parsedData.account.institutionId,
        transactionsFound: parsedData.transactions.length,
        period: parsedData.period,
        openingBalance: parsedData.openingBalance,
        closingBalance: parsedData.closingBalance,
        userId: parsedData.metadata?.userId,
        textLength: text.length,
        linesExtracted: parsedData.metadata?.extractedLines,
      });

      return parsedData;
    } catch (error) {
      throw new Error(
        `Failed to parse PDF statement: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private parseStatementText(
    text: string,
    options: {
      statementId: string;
      accountIdHint?: string;
      institutionId?: string;
      metadata?: Record<string, unknown>;
    },
  ): ParsedStatementDTO {
    const lines = text.split('\n').map((line) => line.trim());

    // Extract account information
    const accountInfo = this.extractAccountInfo(lines, options);

    // Extract statement period
    const period = this.extractPeriod(lines);

    // Extract balances
    const { openingBalance, closingBalance } = this.extractBalances(lines);

    // Extract transactions
    const transactions = this.extractTransactions(lines, accountInfo.accountId);

    // Infer currency (default to USD if not found)
    const currency = accountInfo.currency || 'USD';

    return {
      account: {
        accountId: accountInfo.accountId,
        institutionId: accountInfo.institutionId,
        name: accountInfo.name,
        mask: accountInfo.mask,
        type: accountInfo.type,
        currency,
      },
      period,
      openingBalance,
      closingBalance,
      transactions,
      currency,
      source: 'PDF',
      metadata: {
        ...options.metadata, // Preserve metadata like userId
        extractedLines: lines.length,
        transactionsFound: transactions.length,
      },
    };
  }

  private extractAccountInfo(
    lines: string[],
    options: { accountIdHint?: string; institutionId?: string },
  ): {
    accountId: string;
    institutionId: string;
    name: string;
    mask?: string;
    type: string;
    currency?: string;
  } {
    let accountId = options.accountIdHint || `acc-${Date.now()}`;
    let institutionId = options.institutionId || 'unknown-bank';
    let name = 'Imported Account';
    let mask: string | undefined;
    let type = 'CHECKING';
    let currency: string | undefined;

    // Look for account number patterns
    for (const line of lines) {
      // Account number patterns
      const accountMatch = line.match(/account\s*(?:number|#)?[:\s]+(\d+)/i);
      if (accountMatch) {
        const fullNumber = accountMatch[1];
        accountId = fullNumber;
        mask = fullNumber.slice(-4);
      }

      // Account type
      if (line.match(/checking/i)) type = 'CHECKING';
      else if (line.match(/savings/i)) type = 'SAVINGS';
      else if (line.match(/credit/i)) type = 'CREDIT';

      // Currency
      const currencyMatch = line.match(/\b(USD|EUR|GBP|CAD|AUD)\b/);
      if (currencyMatch) currency = currencyMatch[1];

      // Bank name
      if (!institutionId || institutionId === 'unknown-bank') {
        if (line.match(/chase/i)) institutionId = 'chase';
        else if (line.match(/bank\s+of\s+america/i)) institutionId = 'bofa';
        else if (line.match(/wells\s+fargo/i)) institutionId = 'wells';
        else if (line.match(/citibank/i)) institutionId = 'citi';
      }
    }

    return { accountId, institutionId, name, mask, type, currency };
  }

  private extractPeriod(lines: string[]): { start: string; end: string } {
    let start: string | undefined;
    let end: string | undefined;

    for (const line of lines) {
      // Look for date ranges like "01/01/2024 - 01/31/2024" or "January 1, 2024 to January 31, 2024"
      const rangeMatch = line.match(
        /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})\s*(?:to|-|through)\s*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      );
      if (rangeMatch) {
        start = this.normalizeDate(rangeMatch[1]);
        end = this.normalizeDate(rangeMatch[2]);
        break;
      }

      // Look for "Statement Period:" followed by dates
      if (line.match(/statement\s+period/i)) {
        const dates = line.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/g);
        if (dates && dates.length >= 2) {
          start = this.normalizeDate(dates[0]);
          end = this.normalizeDate(dates[dates.length - 1]);
        }
      }
    }

    // Default to current month if not found
    if (!start || !end) {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      start = firstDay.toISOString().split('T')[0];
      end = lastDay.toISOString().split('T')[0];
    }

    return { start, end };
  }

  private extractBalances(lines: string[]): { openingBalance: number; closingBalance: number } {
    let openingBalance = 0;
    let closingBalance = 0;

    for (const line of lines) {
      // Opening balance patterns
      const openingMatch = line.match(/(?:opening|beginning|previous)\s+balance[:\s]+\$?\s*([\d,]+\.?\d*)/i);
      if (openingMatch) {
        openingBalance = this.parseAmount(openingMatch[1]);
      }

      // Closing balance patterns
      const closingMatch = line.match(/(?:closing|ending|current|new)\s+balance[:\s]+\$?\s*([\d,]+\.?\d*)/i);
      if (closingMatch) {
        closingBalance = this.parseAmount(closingMatch[1]);
      }
    }

    return { openingBalance, closingBalance };
  }

  private extractTransactions(lines: string[], accountId: string): ParsedTransactionDTO[] {
    const transactions: ParsedTransactionDTO[] = [];

    // Common transaction line patterns:
    // "01/15/2024  AMAZON.COM  -45.67  1,234.56"
    // "01/15  STARBUCKS  45.67"
    // "15 Jan  PAYROLL DEPOSIT  +2,500.00"

    const transactionPattern =
      /(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+([-+]?\$?\s*[\d,]+\.?\d*)\s*(\$?\s*[\d,]+\.?\d*)?$/;

    for (const line of lines) {
      const match = line.match(transactionPattern);
      if (match) {
        const [, dateStr, description, amountStr, balanceStr] = match;

        // Skip if description looks like a header
        if (
          description.match(/date|description|amount|balance|transaction/i) ||
          description.length < 3
        ) {
          continue;
        }

        const postedDate = this.normalizeDate(dateStr);
        const amount = this.parseAmount(amountStr);
        const balanceAfter = balanceStr ? this.parseAmount(balanceStr) : undefined;

        transactions.push({
          accountId,
          postedDate,
          description: description.trim(),
          amount,
          currency: 'USD',
          type: amount >= 0 ? ('CREDIT' as const) : ('DEBIT' as const),
          balanceAfter,
          metadata: {
            extractedFromLine: true,
          },
        });
      }
    }

    return transactions;
  }

  private normalizeDate(dateStr: string): string {
    // Handle various date formats and convert to ISO format (YYYY-MM-DD)
    const cleaned = dateStr.replace(/[^\d\/\-]/g, '');
    const parts = cleaned.split(/[\/\-]/);

    if (parts.length === 2) {
      // MM/DD format - assume current year
      const [month, day] = parts.map(Number);
      const year = new Date().getFullYear();
      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    } else if (parts.length === 3) {
      let [part1, part2, part3] = parts.map(Number);

      // Detect format: MM/DD/YY or MM/DD/YYYY or DD/MM/YYYY
      if (part3 < 100) part3 += 2000; // Convert 2-digit year to 4-digit

      // Assume MM/DD/YYYY for US bank statements
      const month = part1;
      const day = part2;
      const year = part3;

      return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }

    // Fallback to today
    return new Date().toISOString().split('T')[0];
  }

  private parseAmount(amountStr: string): number {
    // Remove currency symbols, spaces, and convert to number
    const cleaned = amountStr.replace(/[$,\s]/g, '');
    const value = parseFloat(cleaned);

    // If the original string had parentheses or started with -, make it negative
    if (amountStr.includes('(') || amountStr.startsWith('-')) {
      return -Math.abs(value);
    }

    return value;
  }
}
