export type Cell = string | number | boolean | null | undefined;

/**
 * Spreadsheet apps run cells that start with these characters as formulas.
 * Prefix them with an apostrophe so a name like "=HYPERLINK(...)" stays text.
 */
export function safeCell(value: Cell): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
}

function quote(s: string): string {
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: Cell[][]): string {
  return [headers, ...rows].map((r) => r.map((c) => quote(safeCell(c))).join(",")).join("\r\n") + "\r\n";
}
