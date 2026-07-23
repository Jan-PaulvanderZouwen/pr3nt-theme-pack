const DEFAULT_VAT_RATE = Number(process.env.PR3NT_VAT_RATE || 0.21);

export function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

export function roundMoney(value) {
  return Math.round((money(value) + Number.EPSILON) * 100) / 100;
}

export function fmt(value) {
  return roundMoney(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function quoteLines(quote = {}) {
  if (Array.isArray(quote.quoteLines) && quote.quoteLines.length) return quote.quoteLines;
  if (quote.quoteAmount) return [{ label: 'Offertebedrag', description: '', qty: '1', unit: quote.quoteAmount }];
  return [];
}

export function quoteSubtotalExVat(quote = {}) {
  return roundMoney(quoteLines(quote).reduce((sum, line) => sum + money(line.qty || 1) * money(line.unit || 0), 0));
}

export function quoteVatAmount(quote = {}, vatRate = DEFAULT_VAT_RATE) {
  return roundMoney(quoteSubtotalExVat(quote) * vatRate);
}

export function quoteTotalInclVat(quote = {}, vatRate = DEFAULT_VAT_RATE) {
  return roundMoney(quoteSubtotalExVat(quote) + quoteVatAmount(quote, vatRate));
}

export function vatRatePercent(vatRate = DEFAULT_VAT_RATE) {
  return roundMoney(vatRate * 100);
}

export function quoteVatSummary(quote = {}, vatRate = DEFAULT_VAT_RATE) {
  return {
    rate: vatRate,
    ratePercent: vatRatePercent(vatRate),
    subtotalExVat: quoteSubtotalExVat(quote),
    vatAmount: quoteVatAmount(quote, vatRate),
    totalInclVat: quoteTotalInclVat(quote, vatRate),
  };
}

export function applyVatFields(quote = {}, vatRate = DEFAULT_VAT_RATE) {
  const summary = quoteVatSummary(quote, vatRate);
  quote.vatRate = summary.rate;
  quote.quoteSubtotalExVat = fmt(summary.subtotalExVat);
  quote.quoteVatAmount = fmt(summary.vatAmount);
  quote.quoteTotalInclVat = fmt(summary.totalInclVat);
  return summary;
}
