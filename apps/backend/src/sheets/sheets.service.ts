import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { EmployeesService } from '../employees/employees.service';
import { CreateSheetDto } from './dto/create-sheet.dto';
import { UpsertEntryDto } from './dto/upsert-entry.dto';
import { SheetStatus } from '../types';
import { getDaysInMonth, isWeekend } from 'date-fns';

@Injectable()
export class SheetsService {
  constructor(
    private prisma: PrismaService,
    private employeesService: EmployeesService,
    private auditService: AuditService,
  ) {}

  // Giorni lavorativi del mese (esclude sabato e domenica)
  getWorkingDays(year: number, month: number): number[] {
    const days = getDaysInMonth(new Date(year, month - 1));
    const result: number[] = [];
    for (let d = 1; d <= days; d++) {
      const date = new Date(year, month - 1, d);
      if (!isWeekend(date)) result.push(d);
    }
    return result;
  }

  async findAll(params: { year?: number; month?: number; departmentId?: string; status?: SheetStatus }) {
    return this.prisma.attendanceSheet.findMany({
      where: {
        ...(params.year && { year: params.year }),
        ...(params.month && { month: params.month }),
        ...(params.departmentId && { departmentId: params.departmentId }),
        ...(params.status && { status: params.status }),
      },
      include: {
        department: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { department: { name: 'asc' } }],
    });
  }

  async findOne(id: string) {
    const sheet = await this.prisma.attendanceSheet.findUnique({
      where: { id },
      include: {
        department: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        entries: {
          include: {
            employee: { select: { id: true, code: true, firstName: true, lastName: true, hourlyRate: true } },
          },
        },
      },
    });
    if (!sheet) throw new NotFoundException('Foglio non trovato');
    return sheet;
  }

  async getEmployeesSuggestion(departmentId: string, year: number, month: number) {
    // Dipendenti attivi
    const allActive = await this.prisma.employee.findMany({
      where: { isActive: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
      select: { id: true, code: true, firstName: true, lastName: true, hourlyRate: true },
    });

    // Dipendenti presenti nel foglio del mese precedente per questo reparto
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    const prevSheet = await this.prisma.attendanceSheet.findUnique({
      where: { departmentId_year_month: { departmentId, year: prevYear, month: prevMonth } },
      include: { entries: { select: { employeeId: true }, distinct: ['employeeId'] } },
    });

    const suggestedIds = new Set(prevSheet?.entries.map((e) => e.employeeId) ?? []);
    const suggested = allActive.filter((e) => suggestedIds.has(e.id));
    const available = allActive.filter((e) => !suggestedIds.has(e.id));

    return { suggested, available, hasPrevious: prevSheet !== null };
  }

  async create(dto: CreateSheetDto, userId: string) {
    const exists = await this.prisma.attendanceSheet.findUnique({
      where: { departmentId_year_month: { departmentId: dto.departmentId, year: dto.year, month: dto.month } },
    });
    if (exists) throw new ConflictException('Esiste già un foglio per questo reparto/mese');

    const sheet = await this.prisma.attendanceSheet.create({
      data: {
        departmentId: dto.departmentId,
        year: dto.year,
        month: dto.month,
        notes: dto.notes,
        createdById: userId,
      },
      include: { department: { select: { id: true, code: true, name: true } } },
    });

    // Pre-popola con righe vuote per i dipendenti selezionati (giorno 0 = marker riga)
    // In realtà non servono entry vuote — il foglio mostra i dipendenti estratti dalle entry.
    // Usiamo un approccio alternativo: salviamo gli employeeIds nel foglio come entry placeholder
    // sul giorno 0 (speciale, non lavorativo), così compaiono nella griglia.
    if (dto.employeeIds && dto.employeeIds.length > 0) {
      const workingDays = this.getWorkingDays(dto.year, dto.month);
      const firstDay = workingDays[0];
      // Creiamo una entry vuota sul primo giorno lavorativo per ogni dipendente scelto
      // così la griglia li mostra già (l'utente li compila poi)
      for (const empId of dto.employeeIds) {
        await this.prisma.attendanceEntry.upsert({
          where: { sheetId_employeeId_day: { sheetId: sheet.id, employeeId: empId, day: firstDay } },
          create: { sheetId: sheet.id, employeeId: empId, day: firstDay, ordinaryHours: null, overtimeHours: null, absenceCode: null },
          update: {},
        });
      }
    }

    return sheet;
  }

  // Upsert di una singola cella: dipendente x giorno
  async upsertEntry(sheetId: string, dto: UpsertEntryDto) {
    const sheet = await this.findOne(sheetId);
    if (sheet.status !== 'draft') throw new ForbiddenException('Il foglio non è più in bozza: non modificabile');

    // Verifica che il giorno esista nel mese
    const daysInMonth = getDaysInMonth(new Date(sheet.year, sheet.month - 1));
    if (dto.day < 1 || dto.day > daysInMonth) throw new BadRequestException('Giorno non valido');

    return this.prisma.attendanceEntry.upsert({
      where: {
        sheetId_employeeId_day: {
          sheetId,
          employeeId: dto.employeeId,
          day: dto.day,
        },
      },
      create: {
        sheetId,
        employeeId: dto.employeeId,
        day: dto.day,
        ordinaryHours: dto.ordinaryHours,
        overtimeHours: dto.overtimeHours,
        absenceCode: dto.absenceCode,
        notes: dto.notes,
      },
      update: {
        ordinaryHours: dto.ordinaryHours,
        overtimeHours: dto.overtimeHours,
        absenceCode: dto.absenceCode,
        notes: dto.notes,
      },
    });
  }

  async submit(sheetId: string, userId: string) {
    const sheet = await this.findOne(sheetId);
    if (sheet.status !== 'draft') throw new BadRequestException('Solo i fogli in bozza possono essere inviati');

    return this.prisma.attendanceSheet.update({
      where: { id: sheetId },
      data: { status: 'submitted', submittedById: userId, submittedAt: new Date() },
    });
  }

  async lock(sheetId: string) {
    const sheet = await this.findOne(sheetId);
    if (sheet.status !== 'submitted') throw new BadRequestException('Solo i fogli inviati possono essere bloccati');

    return this.prisma.attendanceSheet.update({
      where: { id: sheetId },
      data: { status: 'locked', lockedAt: new Date() },
    });
  }

  async reopen(sheetId: string) {
    const sheet = await this.findOne(sheetId);
    if (sheet.status !== 'submitted') throw new BadRequestException('Solo i fogli inviati possono essere riaperti');

    return this.prisma.attendanceSheet.update({
      where: { id: sheetId },
      data: { status: 'draft', submittedById: null, submittedAt: null },
    });
  }

  async upsertEmployeeRealRate(sheetId: string, employeeId: string, realRate: number, userId: string) {
    const sheet = await this.findOne(sheetId);

    const existing = await this.prisma.sheetEmployeeRate.findUnique({
      where: { sheetId_employeeId: { sheetId, employeeId } },
    });
    const before = existing ? { realRate: Number(existing.realRate) } : null;

    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const id = require('crypto').randomUUID();
    const result = await this.prisma.sheetEmployeeRate.upsert({
      where: { sheetId_employeeId: { sheetId, employeeId } },
      create: { id, sheetId, employeeId, realRate },
      update: { realRate },
    });

    await this.auditService.log({
      userId,
      action: 'update',
      entity: 'sheet',
      entityId: sheetId,
      entityName: `${sheet.department.name} ${sheet.year}/${sheet.month} - paga reale dipendente`,
      before,
      after: { employeeId, realRate },
    });

    return result;
  }

  // Restituisce il prospetto per paghe: tutti i fogli del mese con totali per dipendente
  async getPayrollView(year: number, month: number) {
    const sheets = await this.prisma.attendanceSheet.findMany({
      where: { year, month, status: { in: ['submitted', 'locked'] } },
      include: {
        department: { select: { id: true, code: true, name: true } },
        entries: {
          include: {
            employee: { select: { id: true, code: true, firstName: true, lastName: true, hourlyRate: true } },
          },
        },
        employeeRates: true,
      },
      orderBy: { department: { name: 'asc' } },
    });

    // Aggrega per reparto: ogni dipendente con totale ore ordinarie e straordinarie
    return (sheets as any[]).map((sheet) => {
      const employeeMap = new Map<string, any>();
      // Mappa employeeId -> realRate per questo foglio
      const ratesMap = new Map<string, number>(
        sheet.employeeRates.map((r: any) => [r.employeeId, Number(r.realRate)])
      );

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

      return {
        sheet: { id: sheet.id, year: sheet.year, month: sheet.month, status: sheet.status },
        department: (sheet as any).department,
        rows: Array.from(employeeMap.values()),
      };
    });
  }
}
