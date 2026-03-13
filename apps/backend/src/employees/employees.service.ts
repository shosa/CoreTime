import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AssignDepartmentDto } from './dto/assign-department.dto';

@Injectable()
export class EmployeesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(includeInactive = false) {
    return this.prisma.employee.findMany({
      where: includeInactive ? undefined : { isActive: true },
      include: {
        departmentAssignments: {
          where: { assignedTo: null },
          include: { department: { select: { id: true, code: true, name: true } } },
          take: 1,
        },
      },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    });
  }

  async findOne(id: string) {
    const emp = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        departmentAssignments: {
          include: { department: { select: { id: true, code: true, name: true } } },
          orderBy: { assignedFrom: 'desc' },
        },
      },
    });
    if (!emp) throw new NotFoundException('Dipendente non trovato');
    return emp;
  }

  async create(dto: CreateEmployeeDto, userId?: string) {
    const { departmentId, ...empData } = dto;
    const exists = await this.prisma.employee.findUnique({ where: { code: empData.code } });
    if (exists) throw new ConflictException('Codice dipendente già in uso');

    return this.prisma.$transaction(async (tx) => {
      const employee = await tx.employee.create({ data: empData });
      if (departmentId) {
        await tx.employeeDepartment.create({
          data: { employeeId: employee.id, departmentId, assignedFrom: new Date() },
        });
      }
      await this.audit.log({
        userId,
        action: 'create',
        entity: 'employee',
        entityId: employee.id,
        entityName: `${employee.lastName} ${employee.firstName}`,
        after: employee,
      });
      return employee;
    });
  }

  async update(id: string, dto: UpdateEmployeeDto, userId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.employee.update({ where: { id }, data: dto });
    await this.audit.log({
      userId,
      action: 'update',
      entity: 'employee',
      entityId: id,
      entityName: `${updated.lastName} ${updated.firstName}`,
      before: { code: before.code, firstName: before.firstName, lastName: before.lastName, hourlyRate: before.hourlyRate },
      after: { code: updated.code, firstName: updated.firstName, lastName: updated.lastName, hourlyRate: updated.hourlyRate },
    });
    return updated;
  }

  async disable(id: string, active: boolean, userId?: string) {
    const emp = await this.findOne(id);
    const updated = await this.prisma.employee.update({ where: { id }, data: { isActive: active } });
    await this.audit.log({
      userId,
      action: active ? 'enable' : 'disable',
      entity: 'employee',
      entityId: id,
      entityName: `${emp.lastName} ${emp.firstName}`,
    });
    return updated;
  }

  async remove(id: string, userId?: string) {
    const emp = await this.findOne(id);

    // Blocca se esistono fogli presenze che referenziano questo dipendente
    const entryCount = await this.prisma.attendanceEntry.count({ where: { employeeId: id } });
    if (entryCount > 0) {
      throw new BadRequestException(
        `Impossibile eliminare: il dipendente è presente in ${entryCount} registrazioni di presenze. Disabilitarlo invece.`,
      );
    }

    await this.prisma.employee.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'delete',
      entity: 'employee',
      entityId: id,
      entityName: `${emp.lastName} ${emp.firstName}`,
      before: emp,
    });
    return emp;
  }

  async assignDepartment(employeeId: string, dto: AssignDepartmentDto, userId?: string) {
    const emp = await this.findOne(employeeId);

    return this.prisma.$transaction(async (tx) => {
      const prev = await tx.employeeDepartment.findFirst({
        where: { employeeId, assignedTo: null },
        include: { department: { select: { name: true } } },
      });

      await tx.employeeDepartment.updateMany({
        where: { employeeId, assignedTo: null },
        data: { assignedTo: new Date(dto.assignedFrom) },
      });

      const newAssignment = await tx.employeeDepartment.create({
        data: { employeeId, departmentId: dto.departmentId, assignedFrom: new Date(dto.assignedFrom) },
        include: { department: { select: { name: true } } },
      });

      await this.audit.log({
        userId,
        action: 'update',
        entity: 'employee',
        entityId: employeeId,
        entityName: `${emp.lastName} ${emp.firstName}`,
        before: { department: prev?.department?.name ?? null },
        after: { department: newAssignment.department?.name ?? null, from: dto.assignedFrom },
      });

      return newAssignment;
    });
  }

  async findByDepartment(departmentId: string, date?: string) {
    const refDate = date ? new Date(date) : new Date();
    const assignments = await this.prisma.employeeDepartment.findMany({
      where: {
        departmentId,
        assignedFrom: { lte: refDate },
        OR: [{ assignedTo: null }, { assignedTo: { gte: refDate } }],
        employee: { isActive: true },
      },
      include: {
        employee: { select: { id: true, code: true, firstName: true, lastName: true, hourlyRate: true } },
      },
      orderBy: { employee: { lastName: 'asc' } },
    });
    return assignments.map((a) => a.employee);
  }
}
