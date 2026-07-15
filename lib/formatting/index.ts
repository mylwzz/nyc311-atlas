const integerFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
});

const oneDecimalFormatter = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function formatInteger(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Not available"
    : integerFormatter.format(value);
}

export function formatExpected(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "Not available";
  }
  return Math.abs(value) < 100
    ? oneDecimalFormatter.format(value)
    : integerFormatter.format(value);
}

export function formatDecimal(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Not available"
    : oneDecimalFormatter.format(value);
}

export function formatPercent(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Not available"
    : `${oneDecimalFormatter.format(value)}%`;
}

export function formatCurrency(value: number | null | undefined): string {
  return value === null || value === undefined || !Number.isFinite(value)
    ? "Not available"
    : currencyFormatter.format(value);
}

export function formatSigned(value: number, suffix = ""): string {
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  return `${sign}${oneDecimalFormatter.format(Math.abs(value))}${suffix}`;
}

export function formatTractName(
  tractName: string,
  borough: string,
): string {
  return `Census Tract ${tractName}, ${borough}`;
}

export function formatDateRange(start: string, end: string): string {
  const format = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  });
  return `${format.format(new Date(start))}–${format.format(new Date(end))}`;
}
