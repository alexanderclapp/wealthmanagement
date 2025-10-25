export interface FXConverterPort {
  convert(
    amount: number,
    fromCurrency: string,
    toCurrency: string,
    asOf: string,
  ): Promise<{ convertedAmount: number; rate: number }>;
}
