import { Injectable, ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';

@Injectable()
export class DepartmentsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async findAll(includeInactive = false) {
    return this.prisma.department.findMany({
      where: includeInactive ? undefined : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    const dept = await this.prisma.department.findUnique({ where: { id } });
    if (!dept) throw new NotFoundException('Reparto non trovato');
    return dept;
  }

  async create(dto: CreateDepartmentDto, userId?: string) {
    const exists = await this.prisma.department.findUnique({ where: { code: dto.code } });
    if (exists) throw new ConflictException('Codice reparto già in uso');
    const dept = await this.prisma.department.create({ data: dto });
    await this.audit.log({
      userId,
      action: 'create',
      entity: 'department',
      entityId: dept.id,
      entityName: dept.name,
      after: dept,
    });
    return dept;
  }

  async update(id: string, dto: UpdateDepartmentDto, userId?: string) {
    const before = await this.findOne(id);
    const updated = await this.prisma.department.update({ where: { id }, data: dto });
    await this.audit.log({
      userId,
      action: 'update',
      entity: 'department',
      entityId: id,
      entityName: updated.name,
      before: { code: before.code, name: before.name },
      after: { code: updated.code, name: updated.name },
    });
    return updated;
  }

  async disable(id: string, active: boolean, userId?: string) {
    const dept = await this.findOne(id);
    const updated = await this.prisma.department.update({ where: { id }, data: { isActive: active } });
    await this.audit.log({
      userId,
      action: active ? 'enable' : 'disable',
      entity: 'department',
      entityId: id,
      entityName: dept.name,
    });
    return updated;
  }

  async remove(id: string, userId?: string) {
    const dept = await this.findOne(id);

    // Blocca se esistono fogli presenze
    const sheetCount = await this.prisma.attendanceSheet.count({ where: { departmentId: id } });
    if (sheetCount > 0) {
      throw new BadRequestException(
        `Impossibile eliminare: il reparto ha ${sheetCount} fogli presenze associati. Disabilitarlo invece.`,
      );
    }

    // Blocca se esistono assegnazioni dipendenti attive
    const activeAssignments = await this.prisma.employeeDepartment.count({
      where: { departmentId: id, assignedTo: null },
    });
    if (activeAssignments > 0) {
      throw new BadRequestException(
        `Impossibile eliminare: ${activeAssignments} dipendenti sono ancora assegnati a questo reparto.`,
      );
    }

    await this.prisma.department.delete({ where: { id } });
    await this.audit.log({
      userId,
      action: 'delete',
      entity: 'department',
      entityId: id,
      entityName: dept.name,
      before: dept,
    });
    return dept;
  }
}
