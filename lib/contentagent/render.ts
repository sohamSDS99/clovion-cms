/**
 * Renders agent-produced template specs into real office files.
 * docx via `docx`, xlsx via `exceljs` — both pure JS, server-safe.
 */
import {
  Document,
  Packer,
  Paragraph,
  HeadingLevel,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";

export interface DocSection {
  heading?: string;
  paragraphs?: string[];
  bullets?: string[];
  table?: { headers: string[]; rows: string[][] };
}

export interface DocxSpec {
  title: string;
  intro?: string;
  sections: DocSection[];
}

export interface SheetSpec {
  name: string;
  headers: string[];
  rows: string[][];
  /** Column widths in characters (optional). */
  widths?: number[];
}

export interface XlsxSpec {
  sheets: SheetSpec[];
}

function docxTable(t: { headers: string[]; rows: string[][] }): Table {
  const header = new TableRow({
    children: t.headers.map(
      (h) =>
        new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
        })
    ),
  });
  const rows = t.rows.map(
    (r) =>
      new TableRow({
        children: t.headers.map(
          (_h, i) => new TableCell({ children: [new Paragraph(r[i] ?? "")] })
        ),
      })
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [header, ...rows],
  });
}

export async function renderDocx(spec: DocxSpec): Promise<Buffer> {
  const children: (Paragraph | Table)[] = [
    new Paragraph({ text: spec.title, heading: HeadingLevel.TITLE }),
  ];
  if (spec.intro) children.push(new Paragraph({ text: spec.intro }));
  for (const s of spec.sections ?? []) {
    if (s.heading) {
      children.push(new Paragraph({ text: s.heading, heading: HeadingLevel.HEADING_1 }));
    }
    for (const p of s.paragraphs ?? []) children.push(new Paragraph({ text: p }));
    for (const b of s.bullets ?? []) {
      children.push(new Paragraph({ text: b, bullet: { level: 0 } }));
    }
    if (s.table?.headers?.length) children.push(docxTable(s.table));
  }
  const doc = new Document({ sections: [{ children }] });
  return Buffer.from(await Packer.toBuffer(doc));
}

export async function renderXlsx(spec: XlsxSpec): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of spec.sheets ?? []) {
    const ws = wb.addWorksheet(sheet.name?.slice(0, 31) || "Sheet");
    ws.addRow(sheet.headers);
    ws.getRow(1).font = { bold: true };
    for (const row of sheet.rows ?? []) ws.addRow(row);
    (sheet.widths ?? sheet.headers.map(() => 28)).forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
export const XLSX_MIME =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
