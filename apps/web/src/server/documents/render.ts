import 'server-only';
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { Gap, PreparedDoc, Section } from '@breakrecords/core/documents';

// Prints a prepared document as a plain, printable PDF (US Letter, black on white). The
// standard PDF fonts only carry Western European characters, so a few symbols are spelled out.

const PAGE = { w: 612, h: 792, margin: 54 };
const INK = rgb(0.08, 0.08, 0.08);
const MUTED = rgb(0.38, 0.38, 0.38);
const RULE = rgb(0.8, 0.8, 0.8);
const FIX = rgb(0.62, 0.12, 0.08);

const SPELLED: Record<string, string> = { '℗': '(P)', '−': '-', '\u2014': '-', '\u2013': '-', '→': '->', '…': '...', ' ': ' ' };
function printable(text: string, font: PDFFont): string {
  let out = '';
  for (const ch of text) {
    const c = SPELLED[ch] ?? ch;
    try { font.encodeText(c); out += c; } catch { out += '?'; }
  }
  return out;
}

class Writer {
  private page!: PDFPage;
  private y = 0;
  constructor(private pdf: PDFDocument, private font: PDFFont, private bold: PDFFont, private footer: string) { this.newPage(); }

  private newPage() {
    this.page = this.pdf.addPage([PAGE.w, PAGE.h]);
    this.y = PAGE.h - PAGE.margin;
  }
  private need(h: number) { if (this.y - h < PAGE.margin + 20) this.newPage(); }
  private get width() { return PAGE.w - PAGE.margin * 2; }

  private wrap(text: string, size: number, font: PDFFont, width: number): string[] {
    const lines: string[] = [];
    for (const para of printable(text, font).split('\n')) {
      let line = '';
      for (const word of para.split(' ')) {
        const next = line ? `${line} ${word}` : word;
        if (font.widthOfTextAtSize(next, size) <= width || !line) line = next;
        else { lines.push(line); line = word; }
      }
      lines.push(line);
    }
    return lines;
  }

  text(text: string, o: { size?: number; bold?: boolean; color?: ReturnType<typeof rgb>; indent?: number; gap?: number } = {}) {
    const size = o.size ?? 10; const font = o.bold ? this.bold : this.font; const indent = o.indent ?? 0;
    for (const line of this.wrap(text, size, font, this.width - indent)) {
      this.need(size + 4);
      this.page.drawText(line, { x: PAGE.margin + indent, y: this.y - size, size, font, color: o.color ?? INK });
      this.y -= size + 4;
    }
    this.y -= o.gap ?? 0;
  }

  rule() { this.need(10); this.page.drawLine({ start: { x: PAGE.margin, y: this.y - 4 }, end: { x: PAGE.w - PAGE.margin, y: this.y - 4 }, thickness: 0.5, color: RULE }); this.y -= 12; }
  space(h: number) { this.y -= h; }

  table(columns: string[], rows: (string | null)[][]) {
    const size = 9; const pad = 4;
    // Width by content, within limits, scaled to fit the page.
    const want = columns.map((c, i) => Math.min(200, Math.max(40, ...[c, ...rows.map((r) => r[i] ?? 'Missing')].map((v) => this.bold.widthOfTextAtSize(printable(v, this.bold), size) + pad * 2))));
    const scale = this.width / want.reduce((a, b) => a + b, 0);
    const widths = want.map((w) => w * scale);
    const drawRow = (cells: (string | null)[], header: boolean) => {
      const wrapped = cells.map((v, i) => this.wrap(v ?? 'Missing', size, header ? this.bold : this.font, widths[i] - pad * 2));
      const h = Math.max(...wrapped.map((l) => l.length)) * (size + 3) + pad;
      this.need(h + 2);
      let x = PAGE.margin;
      wrapped.forEach((lines, i) => {
        lines.forEach((line, j) => this.page.drawText(line, { x: x + pad, y: this.y - pad - size - j * (size + 3), size, font: header ? this.bold : this.font, color: cells[i] === null ? FIX : header ? MUTED : INK }));
        x += widths[i];
      });
      this.y -= h;
      this.page.drawLine({ start: { x: PAGE.margin, y: this.y }, end: { x: PAGE.w - PAGE.margin, y: this.y }, thickness: 0.4, color: RULE });
    };
    drawRow(columns, true);
    for (const r of rows) drawRow(r, false);
    this.y -= 8;
  }

  finish() {
    const pages = this.pdf.getPages();
    pages.forEach((p, i) => p.drawText(printable(`${this.footer}  ·  Page ${i + 1} of ${pages.length}`, this.font), { x: PAGE.margin, y: PAGE.margin - 20, size: 8, font: this.font, color: MUTED }));
  }
}

function section(w: Writer, s: Section) {
  w.text(s.heading, { size: 13, bold: true, gap: 4 });
  if (s.intro) w.text(s.intro, { color: MUTED, gap: 6 });
  if (s.rows) {
    for (const [label, value] of s.rows) {
      w.text(label, { size: 8, color: MUTED });
      w.text(value ?? 'Missing', { color: value === null ? FIX : INK, gap: 4 });
    }
  }
  if (s.table) w.table(s.table.columns, s.table.rows);
  if (s.steps) s.steps.forEach((step, i) => w.text(`${i + 1}. ${step}`, { indent: 6, gap: 2 }));
  if (s.signatures) {
    for (const name of s.signatures) {
      w.space(22);
      w.rule();
      w.text(`${name}        Signature                                        Date`, { size: 8, color: MUTED });
    }
  }
  w.space(12);
}

function gapsBlock(w: Writer, gaps: Gap[]) {
  if (!gaps.length) return;
  w.text(`Before you submit (${gaps.length})`, { size: 13, bold: true, color: FIX, gap: 4 });
  for (const g of gaps) w.text(`${g.severity === 'blocker' ? 'Fix' : 'Check'}: ${g.field}. ${g.message}`, { indent: 6, gap: 2 });
  w.space(12);
}

/** The document as PDF bytes. `brand` is the platform or label name in the footer. */
export async function renderPdf(doc: PreparedDoc, meta: { brand: string; version: number }): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setCreator(meta.brand);
  pdf.setProducer(meta.brand);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const w = new Writer(pdf, font, bold, `${doc.title}, version ${meta.version}. Prepared by ${meta.brand}; a person reviews and submits it.`);
  w.text(doc.title, { size: 18, bold: true, gap: 2 });
  w.text(doc.subtitle, { color: MUTED, gap: 10 });
  w.rule();
  gapsBlock(w, doc.gaps);
  for (const s of doc.sections) section(w, s);
  w.finish();
  return pdf.save({ useObjectStreams: false });
}
