import { Injectable } from '@nestjs/common';
import { SheetsService } from '../sheets/sheets.service';
import { PrismaService } from '../prisma/prisma.service';
import * as PDFDocument from 'pdfkit';
import { getDaysInMonth } from 'date-fns';

const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

type DayType = 'weekday' | 'saturday' | 'sunday';
interface DayInfo { day: number; type: DayType; }

function getAllDays(year: number, month: number): DayInfo[] {
  const result: DayInfo[] = [];
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  for (let d = 1; d <= daysInMonth; d++) {
    const dow = new Date(year, month - 1, d).getDay();
    result.push({ day: d, type: dow === 0 ? 'sunday' : dow === 6 ? 'saturday' : 'weekday' });
  }
  return result;
}

@Injectable()
export class ExportService {
  constructor(private sheetsService: SheetsService, private prisma: PrismaService) {}

  // Genera il PDF del foglio presenze (da stampare e compilare a mano)
  async generateBlankSheet(sheetId: string): Promise<Buffer> {
    const sheet = await this.sheetsService.findOne(sheetId) as any;
    const allDays = getAllDays(sheet.year, sheet.month);

    const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      const monthName = MONTH_NAMES[sheet.month - 1];

      // Titolo
      doc.fontSize(13).font('Helvetica-Bold')
        .text(`FOGLIO PRESENZE - ${sheet.department.name.toUpperCase()} - ${monthName.toUpperCase()} ${sheet.year}`, { align: 'center' });
      doc.moveDown(0.4);

      // ── Legenda ancorata sopra la tabella ──────────────────────────────
      const legendItems = [
        { code: 'F',   label: 'Ferie' },
        { code: 'M',   label: 'Malattia' },
        { code: 'P',   label: 'Permesso' },
        { code: 'FE',  label: 'Festivo' },
        { code: 'AS',  label: 'Assente' },
        { code: 'MAT', label: 'Maternità' },
      ];
      const legendH = 16;
      const legendFontSize = 7;
      let lx = 20;
      const ly = doc.y;

      // Casella SAB — grigio chiaro
      const sabW = 22;
      doc.rect(lx, ly, sabW, legendH).fillColor('#cccccc').fill();
      doc.strokeColor('#000000').lineWidth(0.5).rect(lx, ly, sabW, legendH).stroke();
      doc.fillColor('#000000').fontSize(legendFontSize).font('Helvetica')
        .text('SAB', lx, ly + (legendH - legendFontSize) / 2, { width: sabW, align: 'center', lineBreak: false });
      lx += sabW + 6;

      // Casella DOM — grigio scuro
      const domW = 22;
      doc.rect(lx, ly, domW, legendH).fillColor('#888888').fill();
      doc.strokeColor('#000000').lineWidth(0.5).rect(lx, ly, domW, legendH).stroke();
      doc.fillColor('#ffffff').fontSize(legendFontSize).font('Helvetica')
        .text('DOM', lx, ly + (legendH - legendFontSize) / 2, { width: domW, align: 'center', lineBreak: false });
      lx += domW + 10;

      // Codici assenza con badge nero
      doc.fillColor('#000000');
      for (const item of legendItems) {
        const badgeW = item.code.length <= 2 ? 18 : 24;
        doc.rect(lx, ly, badgeW, legendH).fillColor('#111111').fill();
        doc.strokeColor('#000000').lineWidth(0.5).rect(lx, ly, badgeW, legendH).stroke();
        doc.fillColor('#ffffff').fontSize(legendFontSize).font('Helvetica-Bold')
          .text(item.code, lx, ly + (legendH - legendFontSize) / 2, { width: badgeW, align: 'center', lineBreak: false });
        lx += badgeW + 3;
        doc.fillColor('#000000').fontSize(legendFontSize).font('Helvetica')
          .text(item.label, lx, ly + (legendH - legendFontSize) / 2, { width: 40, align: 'left', lineBreak: false });
        lx += 44;
      }

      doc.y = ly + legendH + 4;

      // ── Layout tabella ─────────────────────────────────────────────────
      const pageWidth = doc.page.width - 40;
      const codeColW = 45;
      const nameColW = 120;
      const dayColW = Math.floor((pageWidth - codeColW - nameColW) / allDays.length);
      const rowH = 20;
      const headerH = 22;
      let x = 20;
      let y = doc.y;

      // Header
      doc.fontSize(7).font('Helvetica-Bold');
      this.drawCell(doc, x, y, codeColW, headerH, 'COD.', true);
      this.drawCell(doc, x + codeColW, y, nameColW, headerH, 'NOMINATIVO', true);
      let dayX = x + codeColW + nameColW;
      for (const { day, type } of allDays) {
        this.drawDayCell(doc, dayX, y, dayColW, headerH, String(day), type, true, true);
        dayX += dayColW;
      }
      y += headerH;

      // Righe dipendenti (vuote per compilazione manuale)
      const employees = this.getUniqueEmployees(sheet);
      doc.fontSize(7).font('Helvetica');

      for (const emp of employees) {
        this.drawCell(doc, x, y, codeColW, rowH, emp.code);
        this.drawCell(doc, x + codeColW, y, nameColW, rowH, `${emp.lastName} ${emp.firstName}`);
        let dx = x + codeColW + nameColW;
        for (const { type } of allDays) {
          this.drawDayCell(doc, dx, y, dayColW, rowH, '', type, false, true);
          dx += dayColW;
        }
        y += rowH;
      }


      doc.end();
    });

    return Buffer.concat(chunks);
  }

  // Genera il PDF con dati compilati (per l'HR)
  async generateFilledSheet(sheetId: string): Promise<Buffer> {
    const sheet = await this.sheetsService.findOne(sheetId) as any;
    const allDays = getAllDays(sheet.year, sheet.month);
    const entriesMap = this.buildEntriesMap(sheet.entries);
    const employees = this.getUniqueEmployees(sheet);
    const monthName = MONTH_NAMES[sheet.month - 1];

    const doc = new PDFDocument({ margin: 20, size: 'A4', layout: 'landscape' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      doc.fontSize(14).font('Helvetica-Bold')
        .text(`PRESENZE COMPILATE - ${sheet.department.name.toUpperCase()} - ${monthName} ${sheet.year}`, { align: 'center' });
      doc.moveDown(0.5);

      const pageWidth = doc.page.width - 40;
      const codeColW = 45;
      const nameColW = 120;
      const dayColW = Math.floor((pageWidth - codeColW - nameColW - 60) / allDays.length);
      const totalColW = 35;
      const totalOtColW = 35;
      const rowH = 20;
      const headerH = 24;
      let x = 20;
      let y = doc.y;

      doc.fontSize(7).font('Helvetica-Bold');
      this.drawCell(doc, x, y, codeColW, headerH, 'COD.', true);
      this.drawCell(doc, x + codeColW, y, nameColW, headerH, 'NOMINATIVO', true);
      let dayX = x + codeColW + nameColW;
      for (const { day, type } of allDays) {
        this.drawDayCell(doc, dayX, y, dayColW, headerH, String(day), type, true);
        dayX += dayColW;
      }
      this.drawCell(doc, dayX, y, totalColW, headerH, 'ORD', true);
      this.drawCell(doc, dayX + totalColW, y, totalOtColW, headerH, 'STR', true);
      y += headerH;

      doc.fontSize(7).font('Helvetica');

      for (const emp of employees) {
        let totalOrd = 0;
        let totalOt = 0;
        this.drawCell(doc, x, y, codeColW, rowH, emp.code);
        this.drawCell(doc, x + codeColW, y, nameColW, rowH, `${emp.lastName} ${emp.firstName}`);
        let dx = x + codeColW + nameColW;
        for (const { day, type } of allDays) {
          const entry = entriesMap[emp.id]?.[day];
          let cellText = '';
          if (entry) {
            if (entry.absenceCode) {
              cellText = entry.absenceCode;
            } else {
              if (entry.ordinaryHours) { cellText = String(entry.ordinaryHours); totalOrd += Number(entry.ordinaryHours); }
              if (entry.overtimeHours) { totalOt += Number(entry.overtimeHours); }
            }
          }
          this.drawDayCell(doc, dx, y, dayColW, rowH, cellText, type, false);
          dx += dayColW;
        }
        this.drawCell(doc, dx, y, totalColW, rowH, totalOrd > 0 ? String(totalOrd) : '');
        this.drawCell(doc, dx + totalColW, y, totalOtColW, rowH, totalOt > 0 ? String(totalOt) : '');
        y += rowH;
      }

      doc.end();
    });

    return Buffer.concat(chunks);
  }

  // Genera il PDF del prospetto paghe (report professionale per HR)
  async generatePayrollReport(sheetId: string): Promise<Buffer> {
    const sheet = await this.sheetsService.findOne(sheetId) as any;

    // Carica le paghe reali per questo foglio (findOne non le include)
    const employeeRates = await this.prisma.sheetEmployeeRate.findMany({
      where: { sheetId },
    });

    const ratesMap = new Map<string, number>(
      employeeRates.map((r: any) => [r.employeeId, Number(r.realRate)])
    );

    const employeeMap = new Map<string, any>();
    for (const entry of sheet.entries) {
      const key = entry.employeeId;
      if (!employeeMap.has(key)) {
        employeeMap.set(key, {
          employee: entry.employee,
          totalOrdinary: 0,
          totalOvertime: 0,
          absences: {} as Record<string, number>,
          realRate: ratesMap.get(key) ?? null,
        });
      }
      const row = employeeMap.get(key);
      row.totalOrdinary += Number(entry.ordinaryHours || 0);
      row.totalOvertime += Number(entry.overtimeHours || 0);
      if (entry.absenceCode) {
        row.absences[entry.absenceCode] = (row.absences[entry.absenceCode] || 0) + 1;
      }
    }

    const rows = Array.from(employeeMap.values()).sort((a, b) =>
      a.employee.lastName.localeCompare(b.employee.lastName)
    );

    const monthName = MONTH_NAMES[sheet.month - 1];
    const doc = new PDFDocument({ margin: 36, size: 'A4', layout: 'portrait' });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));

    await new Promise<void>((resolve) => {
      doc.on('end', resolve);

      const pageW = doc.page.width - 72; // 36 margin each side
      const LEFT = 36;

      // ── HEADER BLOCK ──────────────────────────────────────────────────────
      // Gray title bar
      doc.rect(LEFT, 36, pageW, 28).fillColor('#1e293b').fill();
      doc.fillColor('#ffffff').fontSize(13).font('Helvetica-Bold')
        .text('PROSPETTO PAGHE', LEFT, 44, { width: pageW, align: 'center', lineBreak: false });

      // Subtitle bar
      doc.rect(LEFT, 64, pageW, 18).fillColor('#334155').fill();
      doc.fillColor('#cbd5e1').fontSize(8.5).font('Helvetica')
        .text(
          `${sheet.department.name.toUpperCase()}  ·  ${monthName.toUpperCase()} ${sheet.year}  ·  Stato: ${sheet.status.toUpperCase()}`,
          LEFT, 69, { width: pageW, align: 'center', lineBreak: false }
        );

      doc.fillColor('#000000');
      let y = 92;

      // ── META INFO ─────────────────────────────────────────────────────────
      const metaFontSize = 7.5;
      doc.fontSize(metaFontSize).font('Helvetica')
        .fillColor('#64748b')
        .text(`Reparto: ${sheet.department.code} – ${sheet.department.name}`, LEFT, y)
        .text(`Periodo: ${monthName} ${sheet.year}`, LEFT + pageW / 2, y);
      y += 12;
      doc.text(`Generato il: ${new Date().toLocaleDateString('it-IT')}`, LEFT, y)
        .text(`Dipendenti: ${rows.length}`, LEFT + pageW / 2, y);
      y += 18;

      // Separator line
      doc.strokeColor('#e2e8f0').lineWidth(1).moveTo(LEFT, y).lineTo(LEFT + pageW, y).stroke();
      y += 10;

      doc.fillColor('#000000');

      // ── TABLE SETUP ───────────────────────────────────────────────────────
      // Columns: #, Cod, Nominativo, Ore Ord, Ore Str, Tot Ore, Malattia, P.Base €/h, P.Reale €/h, Imp.Base, Imp.Reale
      const COL = {
        num:      { x: LEFT,          w: 18 },
        cod:      { x: LEFT + 18,     w: 36 },
        name:     { x: LEFT + 54,     w: 110 },
        ordH:     { x: LEFT + 164,    w: 38 },
        otH:      { x: LEFT + 202,    w: 38 },
        totH:     { x: LEFT + 240,    w: 38 },
        mal:      { x: LEFT + 278,    w: 30 },
        baseRate: { x: LEFT + 308,    w: 42 },
        realRate: { x: LEFT + 350,    w: 42 },
        impBase:  { x: LEFT + 392,    w: 52 },
        impReal:  { x: LEFT + 444,    w: 52 },
      };

      const HEADER_H = 28;
      const ROW_H = 16;

      // ── TABLE HEADER ──────────────────────────────────────────────────────
      const drawHeaderCell = (col: { x: number; w: number }, text: string, subtext?: string) => {
        doc.rect(col.x, y, col.w, HEADER_H).fillColor('#0f172a').fill();
        doc.strokeColor('#1e293b').lineWidth(0.5).rect(col.x, y, col.w, HEADER_H).stroke();
        const textY = subtext ? y + 5 : y + (HEADER_H - 7) / 2;
        doc.fillColor('#f1f5f9').fontSize(6.5).font('Helvetica-Bold')
          .text(text, col.x + 2, textY, { width: col.w - 4, align: 'center', lineBreak: false });
        if (subtext) {
          doc.fillColor('#94a3b8').fontSize(5.5).font('Helvetica')
            .text(subtext, col.x + 2, y + 16, { width: col.w - 4, align: 'center', lineBreak: false });
        }
        doc.fillColor('#000000');
      };

      drawHeaderCell(COL.num, '#');
      drawHeaderCell(COL.cod, 'COD.');
      drawHeaderCell(COL.name, 'NOMINATIVO');
      drawHeaderCell(COL.ordH, 'ORE', 'Ordinarie');
      drawHeaderCell(COL.otH, 'ORE', 'Straord.');
      drawHeaderCell(COL.totH, 'TOT', 'Ore');
      drawHeaderCell(COL.mal, 'MAL.', 'gg');
      drawHeaderCell(COL.baseRate, 'P. BASE', '€/ora');
      drawHeaderCell(COL.realRate, 'P. REALE', '€/ora');
      drawHeaderCell(COL.impBase, 'IMP. BASE', '€');
      drawHeaderCell(COL.impReal, 'IMP. REALE', '€');
      y += HEADER_H;

      // ── TABLE ROWS ────────────────────────────────────────────────────────
      const drawDataCell = (
        col: { x: number; w: number },
        text: string,
        rowY: number,
        opts: { align?: 'left' | 'center' | 'right'; bold?: boolean; bg?: string; fg?: string } = {}
      ) => {
        const bg = opts.bg ?? '#ffffff';
        const fg = opts.fg ?? '#0f172a';
        doc.rect(col.x, rowY, col.w, ROW_H).fillColor(bg).fill();
        doc.strokeColor('#e2e8f0').lineWidth(0.3).rect(col.x, rowY, col.w, ROW_H).stroke();
        doc.fillColor(fg).fontSize(6.5).font(opts.bold ? 'Helvetica-Bold' : 'Helvetica')
          .text(text, col.x + 3, rowY + (ROW_H - 6.5) / 2, {
            width: col.w - 6,
            align: opts.align ?? 'right',
            lineBreak: false,
          });
        doc.fillColor('#000000');
      };

      const fmt = (n: number, dec = 2) => n.toFixed(dec).replace('.', ',');
      const fmtRate = (n: number | null) => n !== null ? fmt(n) : '—';

      let totOrd = 0, totOt = 0, totBase = 0, totReal = 0, totMal = 0;

      rows.forEach((row, idx) => {
        const isEven = idx % 2 === 0;
        const rowBg = isEven ? '#f8fafc' : '#ffffff';
        const rowY = y + idx * ROW_H;

        const base = Number(row.employee.hourlyRate);
        const real = row.realRate !== null ? row.realRate : base;
        const ordH = row.totalOrdinary;
        const otH = row.totalOvertime;
        const totH = ordH + otH * 1.25;
        const impBase = totH * base;
        const impReal = totH * real;
        const malDays = row.absences['M'] ?? 0;

        totOrd += ordH;
        totOt += otH;
        totBase += impBase;
        totReal += impReal;
        totMal += malDays;

        const realRateDiffers = row.realRate !== null && row.realRate !== base;

        drawDataCell(COL.num, String(idx + 1), rowY, { align: 'center', bg: rowBg, fg: '#94a3b8' });
        drawDataCell(COL.cod, row.employee.code, rowY, { align: 'center', bg: rowBg, fg: '#475569' });
        drawDataCell(COL.name, `${row.employee.lastName} ${row.employee.firstName}`, rowY, { align: 'left', bold: true, bg: rowBg });
        drawDataCell(COL.ordH, fmt(ordH, 2), rowY, { bg: rowBg });
        drawDataCell(COL.otH, otH > 0 ? fmt(otH, 2) : '—', rowY, { bg: rowBg, fg: otH > 0 ? '#0f172a' : '#94a3b8' });
        drawDataCell(COL.totH, fmt(totH, 2), rowY, { bold: true, bg: rowBg });
        drawDataCell(COL.mal, malDays > 0 ? String(malDays) : '—', rowY, { align: 'center', bg: rowBg, fg: malDays > 0 ? '#b45309' : '#94a3b8' });
        drawDataCell(COL.baseRate, fmt(base), rowY, { bg: rowBg, fg: '#334155' });
        drawDataCell(COL.realRate, fmtRate(row.realRate), rowY, {
          bg: realRateDiffers ? '#fef9c3' : rowBg,
          fg: realRateDiffers ? '#854d0e' : '#334155',
          bold: realRateDiffers,
        });
        drawDataCell(COL.impBase, fmt(impBase), rowY, { bg: rowBg });
        drawDataCell(COL.impReal, fmt(impReal), rowY, {
          bg: realRateDiffers ? '#fef9c3' : rowBg,
          bold: true,
          fg: realRateDiffers ? '#854d0e' : '#0f172a',
        });
      });

      y += rows.length * ROW_H;

      // ── TOTALS ROW ────────────────────────────────────────────────────────
      const drawTotalCell = (col: { x: number; w: number }, text: string) => {
        doc.rect(col.x, y, col.w, ROW_H).fillColor('#1e293b').fill();
        doc.strokeColor('#0f172a').lineWidth(0.5).rect(col.x, y, col.w, ROW_H).stroke();
        doc.fillColor('#f1f5f9').fontSize(6.5).font('Helvetica-Bold')
          .text(text, col.x + 3, y + (ROW_H - 6.5) / 2, { width: col.w - 6, align: 'right', lineBreak: false });
        doc.fillColor('#000000');
      };

      doc.rect(COL.num.x, y, COL.name.x + COL.name.w - COL.num.x, ROW_H).fillColor('#1e293b').fill();
      doc.fillColor('#94a3b8').fontSize(6.5).font('Helvetica-Bold')
        .text('TOTALE REPARTO', LEFT + 4, y + (ROW_H - 6.5) / 2, {
          width: COL.name.x + COL.name.w - LEFT - 4,
          align: 'left', lineBreak: false,
        });

      drawTotalCell(COL.ordH, fmt(totOrd, 2));
      drawTotalCell(COL.otH, fmt(totOt, 2));
      drawTotalCell(COL.totH, fmt(totOrd + totOt * 1.25, 2));
      drawTotalCell(COL.mal, String(totMal));
      drawTotalCell(COL.baseRate, '');
      drawTotalCell(COL.realRate, '');
      drawTotalCell(COL.impBase, fmt(totBase));
      drawTotalCell(COL.impReal, fmt(totReal));
      y += ROW_H + 18;

      // ── SUMMARY BOXES ────────────────────────────────────────────────────
      const boxW = (pageW - 8) / 3;
      const drawSummaryBox = (bx: number, label: string, value: string, sub?: string) => {
        doc.rect(bx, y, boxW, 36).strokeColor('#e2e8f0').lineWidth(1).stroke();
        doc.fillColor('#64748b').fontSize(6.5).font('Helvetica')
          .text(label.toUpperCase(), bx + 8, y + 7, { width: boxW - 16, align: 'left', lineBreak: false });
        doc.fillColor('#0f172a').fontSize(13).font('Helvetica-Bold')
          .text(value, bx + 8, y + 16, { width: boxW - 16, align: 'left', lineBreak: false });
        if (sub) {
          doc.fillColor('#94a3b8').fontSize(6).font('Helvetica')
            .text(sub, bx + 8, y + 29, { width: boxW - 16, align: 'left', lineBreak: false });
        }
      };

      drawSummaryBox(LEFT,          'Totale Imponibile Base', `€ ${fmt(totBase)}`, 'con paga base standard');
      drawSummaryBox(LEFT + boxW + 4, 'Totale Imponibile Reale', `€ ${fmt(totReal)}`, 'con paga reale concordata');
      drawSummaryBox(LEFT + (boxW + 4) * 2, 'Differenziale', `€ ${fmt(totReal - totBase)}`, totReal > totBase ? '↑ maggiorazione paga reale' : totReal < totBase ? '↓ riduzione paga reale' : 'nessuna differenza');

      y += 52;

      // ── NOTE LEGENDA ─────────────────────────────────────────────────────
      doc.strokeColor('#e2e8f0').lineWidth(0.5).moveTo(LEFT, y).lineTo(LEFT + pageW, y).stroke();
      y += 8;
      doc.fillColor('#64748b').fontSize(6).font('Helvetica')
        .text(
          'Note: Ore Straordinarie pesate x1.25 nel calcolo del totale ore ponderate. ' +
          'Imponibile = Ore Totali Ponderate × Paga Oraria. ' +
          'P. Reale evidenziata in giallo se diversa dalla paga base contrattuale. ' +
          'MAL. = giorni di malattia.',
          LEFT, y, { width: pageW, lineBreak: true }
        );

      // ── FOOTER ───────────────────────────────────────────────────────────
      const footerY = doc.page.height - 36;
      doc.strokeColor('#e2e8f0').lineWidth(0.5)
        .moveTo(LEFT, footerY - 8).lineTo(LEFT + pageW, footerY - 8).stroke();
      doc.fillColor('#94a3b8').fontSize(6).font('Helvetica')
        .text('CoreTime – Gestione Presenze', LEFT, footerY, { lineBreak: false })
        .text(`${monthName} ${sheet.year} · ${sheet.department.name}`, LEFT, footerY, { width: pageW, align: 'right', lineBreak: false });

      doc.end();
    });

    return Buffer.concat(chunks);
  }

  private drawCell(doc: any, x: number, y: number, w: number, h: number, text: string, bold = false) {
    doc.strokeColor('#000000').lineWidth(0.5).rect(x, y, w, h).stroke();
    doc.fillColor('#000000')
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(text, x + 2, y + (h - 7) / 2, { width: w - 4, align: 'center', lineBreak: false });
  }

  private drawDayCell(doc: any, x: number, y: number, w: number, h: number, text: string, type: 'weekday' | 'saturday' | 'sunday', bold = false, grayscale = false) {
    if (type === 'saturday') {
      const fill = grayscale ? '#cccccc' : '#cce4f7';
      doc.rect(x, y, w, h).fillColor(fill).fill();
    } else if (type === 'sunday') {
      const fill = grayscale ? '#888888' : '#e8d5f5';
      doc.rect(x, y, w, h).fillColor(fill).fill();
    }
    // Draw border identical to regular cells (0.5pt black rect on top of fill)
    doc.strokeColor('#000000').lineWidth(0.5).rect(x, y, w, h).stroke();
    const textColor = (type === 'sunday' && grayscale) ? '#ffffff' : '#000000';
    doc.fillColor(textColor)
      .font(bold ? 'Helvetica-Bold' : 'Helvetica')
      .text(text, x + 2, y + (h - 7) / 2, { width: w - 4, align: 'center', lineBreak: false });
    doc.fillColor('#000000');
  }

  private getUniqueEmployees(sheet: any): any[] {
    const seen = new Set<string>();
    const employees: any[] = [];
    for (const entry of sheet.entries) {
      if (!seen.has(entry.employeeId)) {
        seen.add(entry.employeeId);
        employees.push(entry.employee);
      }
    }
    return employees.sort((a, b) => a.lastName.localeCompare(b.lastName));
  }

  private buildEntriesMap(entries: any[]): Record<string, Record<number, any>> {
    const map: Record<string, Record<number, any>> = {};
    for (const e of entries) {
      if (!map[e.employeeId]) map[e.employeeId] = {};
      map[e.employeeId][e.day] = e;
    }
    return map;
  }
}
