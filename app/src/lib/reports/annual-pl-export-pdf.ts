import type { AnnualPlEntry } from "@/lib/accounting-entries-repo";
import { buildAnnualPlReportData, type ExpenseDetailRow, type StatementRow } from "@/lib/reports/annual-pl-report";

type ExportRowKind = "revenue" | "category" | "detail" | "subtotal";

type ExportRow = {
  label: string;
  current: number;
  prior: number;
  kind: ExportRowKind;
  indent: number;
  strongTopRule?: boolean;
  strongest?: boolean;
};

type GenerateAnnualPlExportInput = {
  companyName: string;
  selectedYear: number;
  entries: AnnualPlEntry[];
};

const A4_WIDTH = 595.28;
const A4_HEIGHT = 841.89;
const MARGIN_LEFT = 44;
const MARGIN_RIGHT = 44;
const MARGIN_TOP = 52;
const MARGIN_BOTTOM = 44;
const TABLE_TOP_OFFSET = 134;
const ROW_HEIGHT = 28;
const LABEL_COL_X = MARGIN_LEFT;
const CURRENT_VALUE_RIGHT_X = A4_WIDTH - MARGIN_RIGHT - 140;
const PRIOR_VALUE_RIGHT_X = A4_WIDTH - MARGIN_RIGHT;

function formatAmountCents(amountCents: number): string {
  const raw = new Intl.NumberFormat("de-CH", {
    style: "decimal",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amountCents) / 100);
  const base = raw
    .replace(/[\u2019\u2018\u02BC]/g, "'")
    .replace(/\u00A0/g, " ");
  if (amountCents < 0) {
    return `-${base}`;
  }
  return base;
}

function formatGeneratedAtTimestamp(date: Date): string {
  return new Intl.DateTimeFormat("de-CH", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatGeneratedAtForFilename(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");
  return `${year}${month}${day}T${hour}${minute}${second}Z`;
}

function slugifyCompanyName(name: string): string {
  const trimmed = name.trim();
  if (trimmed.length < 1) {
    return "company";
  }

  const transliterated = trimmed
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/Ä/g, "ae")
    .replace(/Ö/g, "oe")
    .replace(/Ü/g, "ue")
    .replace(/ß/g, "ss");

  const normalized = transliterated
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "");

  return normalized.length > 0 ? normalized : "company";
}

function escapePdfText(value: string): string {
  let output = "";
  for (const char of value) {
    const codePoint = char.codePointAt(0);
    if (codePoint === undefined) {
      continue;
    }
    if (char === "\\" || char === "(" || char === ")") {
      output += `\\${char}`;
      continue;
    }
    if (codePoint >= 32 && codePoint <= 126) {
      output += char;
      continue;
    }
    if (codePoint <= 255) {
      output += `\\${codePoint.toString(8).padStart(3, "0")}`;
      continue;
    }
    output += "?";
  }
  return output;
}

function normalizeLabelWidth(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return `${value.slice(0, maxLength - 3)}...`;
}

function labelForStatementRow(row: StatementRow): string {
  if (row.key === "revenue") {
    return "Umsatz";
  }
  if (row.key === "direct_costs") {
    return "Direkte Kosten";
  }
  if (row.key === "gross_profit") {
    return "Bruttogewinn";
  }
  if (row.key === "operating_expenses") {
    return "Betriebsaufwand";
  }
  if (row.key === "operating_result") {
    return "Betriebsergebnis";
  }
  if (row.key === "financial_other") {
    return "Finanz-/übriger Aufwand";
  }
  if (row.key === "taxes") {
    return "Steuern";
  }
  return "Jahresgewinn / Jahresverlust";
}

function expenseDetailLabel(detail: ExpenseDetailRow): string {
  if (detail.typeOfExpenseId === null && detail.expenseTypeText.trim().length < 1) {
    return "Nicht zugewiesen";
  }
  if (detail.expenseTypeText.trim().length < 1) {
    return "Nicht zugewiesen";
  }
  return detail.expenseTypeText;
}

function pushCategorySection(rows: ExportRow[], categoryRow: StatementRow | undefined, details: ExpenseDetailRow[]) {
  if (!categoryRow) {
    return;
  }
  rows.push({
    label: labelForStatementRow(categoryRow),
    current: categoryRow.current,
    prior: categoryRow.prior,
    kind: "category",
    indent: 0,
  });
  for (const detail of details) {
    rows.push({
      label: normalizeLabelWidth(expenseDetailLabel(detail), 56),
      current: detail.current,
      prior: detail.prior,
      kind: "detail",
      indent: 1,
    });
  }
}

function buildExportRows(input: GenerateAnnualPlExportInput): ExportRow[] {
  const report = buildAnnualPlReportData(input.entries, input.selectedYear);
  const statementByKey = new Map(report.statementRows.map((row) => [row.key, row]));

  const rows: ExportRow[] = [];
  const revenueRow = statementByKey.get("revenue");
  if (revenueRow) {
    rows.push({
      label: labelForStatementRow(revenueRow),
      current: revenueRow.current,
      prior: revenueRow.prior,
      kind: "revenue",
      indent: 0,
    });
  }

  pushCategorySection(rows, statementByKey.get("direct_costs"), report.expenseDetailsByCategory.directCosts);

  const grossProfitRow = statementByKey.get("gross_profit");
  if (grossProfitRow) {
    rows.push({
      label: labelForStatementRow(grossProfitRow),
      current: grossProfitRow.current,
      prior: grossProfitRow.prior,
      kind: "subtotal",
      indent: 0,
      strongTopRule: true,
    });
  }

  pushCategorySection(
    rows,
    statementByKey.get("operating_expenses"),
    report.expenseDetailsByCategory.operatingExpenses,
  );

  const operatingResultRow = statementByKey.get("operating_result");
  if (operatingResultRow) {
    rows.push({
      label: labelForStatementRow(operatingResultRow),
      current: operatingResultRow.current,
      prior: operatingResultRow.prior,
      kind: "subtotal",
      indent: 0,
      strongTopRule: true,
    });
  }

  pushCategorySection(
    rows,
    statementByKey.get("financial_other"),
    report.expenseDetailsByCategory.financialOther,
  );
  pushCategorySection(rows, statementByKey.get("taxes"), report.expenseDetailsByCategory.taxes);

  const netProfitLossRow = statementByKey.get("net_profit_loss");
  if (netProfitLossRow) {
    rows.push({
      label: labelForStatementRow(netProfitLossRow),
      current: netProfitLossRow.current,
      prior: netProfitLossRow.prior,
      kind: "subtotal",
      indent: 0,
      strongTopRule: true,
      strongest: true,
    });
  }

  return rows;
}

function estimateTextWidth(value: string, fontSize: number): number {
  return value.length * fontSize * 0.52;
}

function buildContentStream(input: {
  companyName: string;
  selectedYear: number;
  priorYear: number;
  generatedAtText: string;
  rows: ExportRow[];
}): string {
  const lines: string[] = [];
  const tableStartY = A4_HEIGHT - TABLE_TOP_OFFSET;
  const rowCount = input.rows.length;
  const tableBottomY = tableStartY - ROW_HEIGHT * (rowCount + 1);

  lines.push("0.15 0.15 0.15 rg");
  lines.push("0.15 0.15 0.15 RG");

  lines.push("BT");
  lines.push("/F1 20 Tf");
  lines.push(`${MARGIN_LEFT} ${A4_HEIGHT - MARGIN_TOP} Td`);
  lines.push(`(${escapePdfText("Jahres-Erfolgsrechnung")}) Tj`);
  lines.push("ET");

  lines.push("BT");
  lines.push("/F1 10 Tf");
  lines.push(`${MARGIN_LEFT} ${A4_HEIGHT - MARGIN_TOP - 24} Td`);
  lines.push(
    `(${escapePdfText(
      `${input.companyName}  |  Geschäftsjahr ${input.selectedYear}  |  Vorjahr ${input.priorYear}  |  Management report (Milchbüchleinrechnung)`,
    )}) Tj`,
  );
  lines.push("ET");

  lines.push("BT");
  lines.push("/F1 8 Tf");
  lines.push("0.4 0.4 0.4 rg");
  lines.push(`${MARGIN_LEFT} ${A4_HEIGHT - MARGIN_TOP - 40} Td`);
  lines.push(`(${escapePdfText(`Erstellt (UTC): ${input.generatedAtText}`)}) Tj`);
  lines.push("ET");
  lines.push("0.15 0.15 0.15 rg");
  lines.push("0.15 0.15 0.15 RG");

  lines.push("1 w");
  lines.push(`${MARGIN_LEFT} ${tableStartY + 6} m ${A4_WIDTH - MARGIN_RIGHT} ${tableStartY + 6} l S`);
  lines.push("0.8 w");
  lines.push(`${MARGIN_LEFT} ${tableStartY - 12} m ${A4_WIDTH - MARGIN_RIGHT} ${tableStartY - 12} l S`);

  lines.push("BT");
  lines.push("/F1 12 Tf");
  lines.push(`${LABEL_COL_X} ${tableStartY - 8} Td`);
  lines.push(`(${escapePdfText("Position")}) Tj`);
  lines.push("ET");

  const currentHeader = String(input.selectedYear);
  const priorHeader = `Vorjahr (${input.priorYear})`;
  const currentHeaderWidth = estimateTextWidth(currentHeader, 12);
  const priorHeaderWidth = estimateTextWidth(priorHeader, 12);

  lines.push("BT");
  lines.push("/F1 12 Tf");
  lines.push(`${CURRENT_VALUE_RIGHT_X - currentHeaderWidth} ${tableStartY - 8} Td`);
  lines.push(`(${escapePdfText(currentHeader)}) Tj`);
  lines.push("ET");

  lines.push("BT");
  lines.push("/F1 12 Tf");
  lines.push(`${PRIOR_VALUE_RIGHT_X - priorHeaderWidth} ${tableStartY - 8} Td`);
  lines.push(`(${escapePdfText(priorHeader)}) Tj`);
  lines.push("ET");

  let rowY = tableStartY - 34;
  for (const row of input.rows) {
    if (row.strongTopRule) {
      lines.push("0.7 w");
      lines.push(`${MARGIN_LEFT} ${rowY + 12} m ${A4_WIDTH - MARGIN_RIGHT} ${rowY + 12} l S`);
    }

    const labelFontSize = 12;
    const valueFontSize = 12;
    const labelX = LABEL_COL_X + (row.indent === 1 ? 16 : 0);
    const currentText = formatAmountCents(row.current);
    const priorText = formatAmountCents(row.prior);
    const currentTextWidth = estimateTextWidth(currentText, valueFontSize);
    const priorTextWidth = estimateTextWidth(priorText, valueFontSize);
    const rowFont = row.kind === "subtotal" || row.kind === "category" ? "/F2" : "/F1";

    lines.push("BT");
    lines.push(`${rowFont} ${labelFontSize} Tf`);
    lines.push(`${labelX} ${rowY} Td`);
    lines.push(`(${escapePdfText(row.label)}) Tj`);
    lines.push("ET");

    lines.push("BT");
    lines.push(`${rowFont} ${valueFontSize} Tf`);
    lines.push(`${CURRENT_VALUE_RIGHT_X - currentTextWidth} ${rowY} Td`);
    lines.push(`(${escapePdfText(currentText)}) Tj`);
    lines.push("ET");

    lines.push("BT");
    lines.push(`${rowFont} ${valueFontSize} Tf`);
    lines.push(`${PRIOR_VALUE_RIGHT_X - priorTextWidth} ${rowY} Td`);
    lines.push(`(${escapePdfText(priorText)}) Tj`);
    lines.push("ET");

    lines.push("0.86 0.86 0.86 RG");
    lines.push("0.4 w");
    lines.push(`${MARGIN_LEFT} ${rowY - 10} m ${A4_WIDTH - MARGIN_RIGHT} ${rowY - 10} l S`);
    lines.push("0.15 0.15 0.15 RG");

    if (row.strongest) {
      lines.push("1.2 w");
      lines.push(`${MARGIN_LEFT} ${rowY - 10} m ${A4_WIDTH - MARGIN_RIGHT} ${rowY - 10} l S`);
      lines.push("0.8 w");
    }

    rowY -= ROW_HEIGHT;
  }

  lines.push("BT");
  lines.push("/F1 8 Tf");
  lines.push("0.4 0.4 0.4 rg");
  lines.push(`${MARGIN_LEFT} ${Math.max(MARGIN_BOTTOM - 4, tableBottomY - 20)} Td`);
  lines.push(
    `(${escapePdfText(
      "Vereinfachter Management-Report (Milchbüchleinrechnung), kein gesetzlich vorgeschriebener Abschluss.",
    )}) Tj`,
  );
  lines.push("ET");

  return lines.join("\n");
}

function buildSinglePagePdf(contentStream: string): Buffer {
  const objects: Buffer[] = [];

  const pushObject = (id: number, body: string | Buffer) => {
    const header = Buffer.from(`${id} 0 obj\n`, "ascii");
    const footer = Buffer.from("\nendobj\n", "ascii");
    const payload = typeof body === "string" ? Buffer.from(body, "ascii") : body;
    objects[id] = Buffer.concat([header, payload, footer]);
  };

  const contentBytes = Buffer.from(contentStream, "ascii");
  pushObject(1, "<< /Type /Catalog /Pages 2 0 R >>");
  pushObject(2, "<< /Type /Pages /Kids [3 0 R] /Count 1 >>");
  pushObject(
    3,
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${A4_WIDTH} ${A4_HEIGHT}] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>`,
  );
  pushObject(4, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
  pushObject(5, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>");
  pushObject(
    6,
    Buffer.concat([
      Buffer.from(`<< /Length ${contentBytes.length} >>\nstream\n`, "ascii"),
      contentBytes,
      Buffer.from("\nendstream", "ascii"),
    ]),
  );

  const header = Buffer.from("%PDF-1.4\n%\xFF\xFF\xFF\xFF\n", "binary");
  const objectBuffers = objects.slice(1);
  const offsets: number[] = [0];
  let running = header.length;
  for (const objectBuffer of objectBuffers) {
    offsets.push(running);
    running += objectBuffer.length;
  }

  const xrefStart = running;
  let xref = `xref\n0 ${objectBuffers.length + 1}\n`;
  xref += "0000000000 65535 f \n";
  for (let index = 1; index < offsets.length; index += 1) {
    xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
  }
  const trailer = `trailer\n<< /Size ${objectBuffers.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;

  return Buffer.concat([header, ...objectBuffers, Buffer.from(xref, "ascii"), Buffer.from(trailer, "ascii")]);
}

export function generateAnnualPlExportPdf(input: GenerateAnnualPlExportInput): {
  pdf: Buffer;
  filename: string;
} {
  const now = new Date();
  const generatedAtUtc = formatGeneratedAtForFilename(now);
  const rows = buildExportRows(input);
  const report = buildAnnualPlReportData(input.entries, input.selectedYear);
  const contentStream = buildContentStream({
    companyName: input.companyName,
    selectedYear: input.selectedYear,
    priorYear: report.priorYear,
    generatedAtText: formatGeneratedAtTimestamp(now),
    rows,
  });
  const pdf = buildSinglePagePdf(contentStream);
  const filename = `annual-pl-${slugifyCompanyName(input.companyName)}-${input.selectedYear}-simple-${generatedAtUtc}.pdf`;
  return { pdf, filename };
}
