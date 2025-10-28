import { CategorizedTransactionDTO } from '../../../application/dto/CategorizedTransactionDTO.js';
import { CategorizerPort } from '../../../application/ports/CategorizerPort.js';

interface Rule {
  test: (input: string) => boolean;
  category: string;
  subCategory?: string;
}

const rules: Rule[] = [
  // Income & Transfers
  { test: (desc) => /\b(payroll|salary|paycheck|wage|direct deposit)\b/i.test(desc), category: 'Income', subCategory: 'Salary' },
  { test: (desc) => /\b(transfer from|received|payment received|refund)\b/i.test(desc), category: 'Income', subCategory: 'Transfer' },
  { test: (desc) => /\b(interest|dividend)\b/i.test(desc), category: 'Income', subCategory: 'Investment Income' },
  
  // Restaurants & Dining
  { test: (desc) => /\b(restaurant|restaurante|dining|diner|bistro|pizzeria|sushi|taqueria|burger)\b/i.test(desc), category: 'Food & Dining', subCategory: 'Restaurants' },
  { test: (desc) => /\b(coffee|cafe|cafeteria|starbucks|dunkin|espresso|cappuccino)\b/i.test(desc), category: 'Food & Dining', subCategory: 'Coffee Shops' },
  { test: (desc) => /\b(bar|pub|brewery|taproom|cantina)\b/i.test(desc), category: 'Food & Dining', subCategory: 'Bars & Alcohol' },
  
  // Food Delivery & Groceries
  { test: (desc) => /\b(rappi|uber eats|ubereats|doordash|grubhub|deliveroo|postmates|delivery)\b/i.test(desc), category: 'Food & Dining', subCategory: 'Food Delivery' },
  { test: (desc) => /\b(grocery|groceries|supermarket|supermercado|market|whole foods|trader joe|safeway|kroger|walmart|target|costco)\b/i.test(desc), category: 'Food & Dining', subCategory: 'Groceries' },
  
  // Transportation
  { test: (desc) => /\b(uber|lyft|taxi|cab|rideshare|beat|didi|cabify)\b/i.test(desc), category: 'Transportation', subCategory: 'Ride Share' },
  { test: (desc) => /\b(metro|subway|transit|bus|train|railway|mrt)\b/i.test(desc), category: 'Transportation', subCategory: 'Public Transit' },
  { test: (desc) => /\b(gas|fuel|petrol|gasoline|shell|chevron|exxon|bp)\b/i.test(desc), category: 'Transportation', subCategory: 'Gas & Fuel' },
  { test: (desc) => /\b(parking|park)\b/i.test(desc), category: 'Transportation', subCategory: 'Parking' },
  { test: (desc) => /\b(flight|airline|airways|aviation)\b/i.test(desc), category: 'Travel', subCategory: 'Flights' },
  
  // Shopping & Retail
  { test: (desc) => /\b(amazon|ebay|etsy|mercado libre)\b/i.test(desc), category: 'Shopping', subCategory: 'Online Shopping' },
  { test: (desc) => /\b(tienda|store|shop|boutique|retail)\b/i.test(desc), category: 'Shopping', subCategory: 'General Merchandise' },
  { test: (desc) => /\b(clothing|apparel|fashion|zara|h&m|uniqlo|nike|adidas)\b/i.test(desc), category: 'Shopping', subCategory: 'Clothing' },
  { test: (desc) => /\b(electronics|apple|best buy|microsoft)\b/i.test(desc), category: 'Shopping', subCategory: 'Electronics' },
  
  // Personal Care & Health
  { test: (desc) => /\b(shave|barber|salon|haircut|spa|beauty|cosmetic|nail)\b/i.test(desc), category: 'Personal Care', subCategory: 'Hair & Beauty' },
  { test: (desc) => /\b(gym|fitness|yoga|pilates|workout|peloton)\b/i.test(desc), category: 'Personal Care', subCategory: 'Fitness' },
  { test: (desc) => /\b(pharmacy|drug|cvs|walgreens|medicine|prescription)\b/i.test(desc), category: 'Healthcare', subCategory: 'Pharmacy' },
  { test: (desc) => /\b(doctor|dentist|clinic|hospital|medical|health)\b/i.test(desc), category: 'Healthcare', subCategory: 'Medical' },
  
  // Housing & Utilities
  { test: (desc) => /\b(rent|lease|landlord)\b/i.test(desc), category: 'Housing', subCategory: 'Rent' },
  { test: (desc) => /\b(mortgage|home loan)\b/i.test(desc), category: 'Housing', subCategory: 'Mortgage' },
  { test: (desc) => /\b(electric|electricity|power|utility)\b/i.test(desc), category: 'Bills & Utilities', subCategory: 'Electricity' },
  { test: (desc) => /\b(water|sewer)\b/i.test(desc), category: 'Bills & Utilities', subCategory: 'Water' },
  { test: (desc) => /\b(internet|wifi|broadband|comcast|spectrum|at&t)\b/i.test(desc), category: 'Bills & Utilities', subCategory: 'Internet' },
  { test: (desc) => /\b(phone|mobile|cell|verizon|t-mobile|sprint)\b/i.test(desc), category: 'Bills & Utilities', subCategory: 'Phone' },
  
  // Entertainment & Subscriptions
  { test: (desc) => /\b(netflix|hulu|disney|spotify|apple music|youtube premium|hbo|prime video)\b/i.test(desc), category: 'Entertainment', subCategory: 'Streaming Services' },
  { test: (desc) => /\b(movie|cinema|theater|theatre)\b/i.test(desc), category: 'Entertainment', subCategory: 'Movies' },
  { test: (desc) => /\b(concert|festival|event|ticket)\b/i.test(desc), category: 'Entertainment', subCategory: 'Events' },
  { test: (desc) => /\b(subscription|membership)\b/i.test(desc), category: 'Entertainment', subCategory: 'Subscriptions' },
  
  // Travel & Accommodation
  { test: (desc) => /\b(hotel|motel|inn|resort|airbnb|booking|expedia)\b/i.test(desc), category: 'Travel', subCategory: 'Lodging' },
  { test: (desc) => /\b(vacation|trip|travel|tourism)\b/i.test(desc), category: 'Travel', subCategory: 'General Travel' },
  
  // Financial & Investments
  { test: (desc) => /\b(investment|brokerage|etf|stock|mutual fund)\b/i.test(desc), category: 'Investments', subCategory: 'Brokerage' },
  { test: (desc) => /\b(atm|withdrawal|cash)\b/i.test(desc), category: 'Cash & ATM', subCategory: 'ATM Withdrawal' },
  { test: (desc) => /\b(fee|charge|service charge)\b/i.test(desc), category: 'Fees & Charges', subCategory: 'Bank Fees' },
  { test: (desc) => /\b(insurance|policy)\b/i.test(desc), category: 'Insurance', subCategory: 'Insurance Premium' },
  
  // Education
  { test: (desc) => /\b(tuition|school|university|college|education|course)\b/i.test(desc), category: 'Education', subCategory: 'Tuition & Fees' },
  { test: (desc) => /\b(book|textbook|learning)\b/i.test(desc), category: 'Education', subCategory: 'Books & Supplies' },
];

export class RuleBasedCategorizer implements CategorizerPort {
  async categorize(
    transactions: Array<{ dedupeHash: string; description: string; amount: number; currency: string }>,
    _context: { accountId: string; institutionId?: string | undefined },
  ): Promise<Record<string, CategorizedTransactionDTO>> {
    const categorized: Record<string, CategorizedTransactionDTO> = {};

    for (const txn of transactions) {
      const rule = rules.find((candidate) => candidate.test(txn.description));

      if (rule) {
        categorized[txn.dedupeHash] = {
          dedupeHash: txn.dedupeHash,
          category: rule.category,
          subCategory: rule.subCategory,
          confidence: 0.75,
        };
      } else {
        // Provide a smart default based on amount
        let defaultCategory = 'Other';
        let defaultSubCategory = 'General';
        let confidence = 0.3;
        
        if (txn.amount > 0) {
          // Positive amounts are likely income/transfers
          defaultCategory = 'Income';
          defaultSubCategory = 'Other Income';
          confidence = 0.4;
        } else if (Math.abs(txn.amount) > 500) {
          // Large negative amounts might be bills or rent
          defaultCategory = 'Bills & Utilities';
          defaultSubCategory = 'Other Bills';
          confidence = 0.35;
        } else {
          // Smaller negative amounts likely shopping/dining
          defaultCategory = 'Shopping';
          defaultSubCategory = 'General Merchandise';
          confidence = 0.35;
        }
        
        categorized[txn.dedupeHash] = {
          dedupeHash: txn.dedupeHash,
          category: defaultCategory,
          subCategory: defaultSubCategory,
          confidence,
        };
      }
    }

    return categorized;
  }
}
