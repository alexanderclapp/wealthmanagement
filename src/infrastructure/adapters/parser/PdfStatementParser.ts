import { createRequire } from 'node:module';
import OpenAI from 'openai';
import { ParsedStatementDTO, ParsedStatementSchema, ParsedTransactionDTO } from '../../../application/dto/ParsedStatementDTO.js';
import { StatementParserPort } from '../../../application/ports/StatementParserPort.js';

const require = createRequire(import.meta.url);
// pdf-parse exports a class PDFParse with a constructor, we need to instantiate and call its getText method
const PDFParseClass = require('pdf-parse').PDFParse;

async function pdfParse(buffer: Buffer) {
  const pdfParser = new PDFParseClass({ data: buffer });
  return await pdfParser.getText();
}

const openRouterClient = process.env.OPENROUTER_API_KEY
  ? new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey: process.env.OPENROUTER_API_KEY,
      timeout: 25000, // 25 second timeout (Heroku has 30s limit)
      maxRetries: 0, // Don't retry, fail fast
    })
  : null;

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
        const pdfData = await pdfParse(rawStatement);
        const text = pdfData.text || '';

        // Parse the PDF text, passing all options including metadata
        const parsedData = await this.parseStatementText(text, {
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
        firstFewLines: text.split('\n').slice(0, 20).join('\n'),
      });

      return parsedData;
    } catch (error) {
      throw new Error(
        `Failed to parse PDF statement: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  private async parseStatementText(
    text: string,
    options: {
      statementId: string;
      accountIdHint?: string;
      institutionId?: string;
      metadata?: Record<string, unknown>;
    },
  ): Promise<ParsedStatementDTO> {
    const lines = text.split('\n').map((line) => line.trim());

    // Extract account information
    const accountInfo = this.extractAccountInfo(lines, options);

    // Extract statement period
    const period = this.extractPeriod(lines);

    // Extract balances
    const { openingBalance, closingBalance } = this.extractBalances(lines);

    // Extract transactions using LLM (with fallback to patterns)
    const transactions = await this.extractTransactionsWithLLM(text, accountInfo.accountId);

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

  private async extractTransactionsWithLLM(text: string, accountId: string): Promise<ParsedTransactionDTO[]> {
    if (!openRouterClient) {
      console.log('⚠️ OpenRouter API key not configured, falling back to pattern matching');
      return this.extractTransactionsWithPatterns(text.split('\n'), accountId);
    }

    try {
      console.log('🤖 Using LLM to extract transactions from PDF text');
      
      // Smart text extraction: focus on transaction sections, remove headers/footers
      const relevantText = this.extractRelevantTransactionText(text);
      console.log(`📝 Sending ${relevantText.length} chars to LLM (reduced from ${text.length})`);

      const prompt = `Extract all transactions from this bank statement. Return ONLY a JSON array, no explanation.

Format: [{"date":"YYYY-MM-DD","description":"text","amount":-45.67}]

CRITICAL RULES for amount sign:
- If transaction is in "Money out", "Debit", "Withdrawal", "Purchase" column → NEGATIVE amount (e.g., -87.00)
- If transaction is in "Money in", "Credit", "Deposit", "Payment received" column → POSITIVE amount (e.g., 4768.00)
- If only one amount column: negative for expenses/purchases, positive for income/deposits/transfers in
- Parse dates to YYYY-MM-DD format
- Keep description concise (main merchant/transaction name)
- Return [] if no transactions found

Statement:
${relevantText}`;

      const response = await openRouterClient.chat.completions.create({
        model: 'openai/gpt-4o-mini',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0,
        max_tokens: 8000, // Increased to handle more transactions
      });

      const content = response.choices[0]?.message?.content;
      if (!content) {
        console.log('❌ No response from LLM');
        return this.extractTransactionsWithPatterns(text.split('\n'), accountId);
      }

      // Extract JSON from response (in case LLM added extra text)
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.log('❌ No JSON array found in LLM response');
        return this.extractTransactionsWithPatterns(text.split('\n'), accountId);
      }

      const llmTransactions = JSON.parse(jsonMatch[0]);
      console.log(`✅ LLM extracted ${llmTransactions.length} transactions`);

      return llmTransactions.map((txn: any) => ({
        accountId,
        postedDate: txn.date,
        description: txn.description,
        amount: txn.amount,
        currency: 'USD',
        type: txn.amount >= 0 ? ('CREDIT' as const) : ('DEBIT' as const),
        balanceAfter: txn.balance,
        metadata: {
          extractedByLLM: true,
        },
      }));
    } catch (error) {
      console.error('❌ LLM extraction failed:', error);
      return this.extractTransactionsWithPatterns(text.split('\n'), accountId);
    }
  }

  private extractRelevantTransactionText(text: string): string {
    // Remove excessive headers/footers but keep all transaction data
    const lines = text.split('\n');
    
    // Find where transactions start (look for first date pattern or "transaction" keyword)
    const transactionStartPatterns = [
      /\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}/,  // Any date pattern
      /transaction/i,
    ];
    
    let startIdx = 0;
    for (let i = 0; i < Math.min(lines.length, 100); i++) {
      if (transactionStartPatterns.some(pattern => pattern.test(lines[i]))) {
        // Start a few lines before to include headers
        startIdx = Math.max(0, i - 5);
        break;
      }
    }
    
    // Don't try to find the end - just take everything from start onwards
    // This ensures we don't cut off multi-page statements
    const relevantLines = lines.slice(startIdx);
    const relevantText = relevantLines.join('\n');
    
    // Use a larger limit to capture all transactions - 20k chars should handle most statements
    return relevantText.slice(0, 20000);
  }

  private extractTransactionsWithPatterns(lines: string[], accountId: string): ParsedTransactionDTO[] {
    const transactions: ParsedTransactionDTO[] = [];

    // Try multiple patterns for different bank statement formats
    const patterns = [
      // Pattern 1: "01/15/2024  AMAZON.COM  -45.67  1,234.56"
      /(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+([-+]?\$?\s*[\d,]+\.?\d{2})\s*(\$?\s*[\d,]+\.?\d{2})?$/,
      // Pattern 2: More flexible with optional balance
      /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.{3,50}?)\s+([-+]?\$?\s*[\d,]+\.?\d{0,2})$/,
      // Pattern 3: Date at start, description, then amount
      /^(\d{1,2}[\/\-]\d{1,2}(?:[\/\-]\d{2,4})?)\s+(.+?)\s+([-+]?\(?\$?\s*[\d,]+\.?\d{0,2}\)?)\s*$/,
    ];

    console.log(`🔍 Attempting to extract transactions from ${lines.length} lines`);
    let attemptedMatches = 0;

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.length < 10) continue; // Skip very short lines

      for (const pattern of patterns) {
        const match = trimmedLine.match(pattern);
        if (match) {
          attemptedMatches++;
          const dateStr = match[1];
          const description = match[2]?.trim();
          const amountStr = match[3];
          const balanceStr = match[4];

          // Skip if description looks like a header or is too short
          if (
            !description ||
            description.length < 3 ||
            description.match(/^(date|description|amount|balance|transaction|posting|reference)$/i)
          ) {
            continue;
          }

          try {
            const postedDate = this.normalizeDate(dateStr);
            const amount = this.parseAmount(amountStr);
            
            // Skip if amount is 0 or invalid
            if (isNaN(amount) || amount === 0) {
              continue;
            }

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
                rawLine: line,
              },
            });

            break; // Found a match, don't try other patterns for this line
          } catch (error) {
            // Failed to parse this line, continue
            continue;
          }
        }
      }
    }

    console.log(`✅ Extracted ${transactions.length} transactions from ${attemptedMatches} potential matches`);
    
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
