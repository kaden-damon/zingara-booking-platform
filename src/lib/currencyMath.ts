export function toCurrencyAmount(value: number) {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export function calculateCurrencyPercentage(value: number, rate: number) {
  return toCurrencyAmount(toCurrencyAmount(value) * rate);
}
