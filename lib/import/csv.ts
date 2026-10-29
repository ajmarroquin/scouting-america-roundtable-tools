import Papa from "papaparse";

export type CsvRow = Record<string, string | undefined>;

/** Parses CSV text with a header row. Strips a UTF-8 byte-order mark. */
export function parseCsvText(text: string): { fields: string[]; rows: CsvRow[] } {
  const result = Papa.parse<CsvRow>(text.replace(/^﻿/, ""), {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.replace(/^﻿/, "").trim(),
  });
  return { fields: result.meta.fields ?? [], rows: result.data };
}
