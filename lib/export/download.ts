"use client";

import { type Cell, safeCell, toCsv } from "./csv";

function save(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function stamp(): string {
  return new Date().toISOString().slice(0, 10);
}

export function downloadCsv(fileName: string, headers: string[], rows: Cell[][]) {
  // The BOM tells Excel the file is UTF-8, so accented names survive.
  save(new Blob(["﻿" + toCsv(headers, rows)], { type: "text/csv;charset=utf-8" }), fileName);
}

export async function downloadXlsx(fileName: string, sheets: { name: string; headers: string[]; rows: Cell[][] }[]) {
  // Loaded on demand: ExcelJS is large and only needed when someone exports.
  const { default: ExcelJS } = await import("exceljs");
  const book = new ExcelJS.Workbook();
  for (const s of sheets) {
    const sheet = book.addWorksheet(s.name.slice(0, 31));
    sheet.addRow(s.headers).font = { bold: true };
    for (const row of s.rows) sheet.addRow(row.map((c) => (typeof c === "number" ? c : safeCell(c))));
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: s.headers.length } };
    sheet.columns.forEach((col, i) => {
      const longest = Math.max(s.headers[i]?.length ?? 0, ...s.rows.map((r) => String(r[i] ?? "").length));
      col.width = Math.min(Math.max(longest + 2, 8), 60);
    });
  }
  const buffer = await book.xlsx.writeBuffer();
  save(new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), fileName);
}
