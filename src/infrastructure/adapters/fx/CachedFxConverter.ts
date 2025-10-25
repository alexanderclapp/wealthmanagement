import { FXConverterPort } from '../../../application/ports/FXConverterPort.js';

interface RateCacheEntry {
  rate: number;
  asOf: string;
}

export class CachedFxConverter implements FXConverterPort {
  private readonly cache = new Map<string, RateCacheEntry>();

  constructor(initialRates: Array<{ pair: string; rate: number; asOf: string }> = []) {
    initialRates.forEach((entry) => this.cache.set(entry.pair.toUpperCase(), { rate: entry.rate, asOf: entry.asOf }));
  }

  async convert(amount: number, fromCurrency: string, toCurrency: string, asOf: string): Promise<{ convertedAmount: number; rate: number }> {
    if (fromCurrency === toCurrency) {
      return { convertedAmount: amount, rate: 1 };
    }

    const pair = `${fromCurrency}_${toCurrency}`.toUpperCase();
    let entry = this.cache.get(pair);

    if (!entry) {
      entry = { rate: 1, asOf };
      this.cache.set(pair, entry);
    }

    return { convertedAmount: amount * entry.rate, rate: entry.rate };
  }

  setRate(fromCurrency: string, toCurrency: string, rate: number, asOf: string): void {
    const pair = `${fromCurrency}_${toCurrency}`.toUpperCase();
    this.cache.set(pair, { rate, asOf });
  }
}
