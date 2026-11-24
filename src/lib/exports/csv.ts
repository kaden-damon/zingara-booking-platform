export function escapeCsvValue(value: unknown) {
  // Quoting alone does not prevent spreadsheet formula execution.
  const raw = String(value ?? "");
  const text = typeof value === "string" && /^[\s\u0000-\u001f]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function createCsvFromSheet(sheet: {
  columns: readonly string[];
  rows: ReadonlyArray<Record<string, unknown>>;
}) {
  return [sheet.columns.map(escapeCsvValue).join(","), ...sheet.rows.map(row =>
    sheet.columns.map(column => escapeCsvValue(row[column])).join(","))].join("\r\n");
}
