import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditAction, AuditEntity } from '@prisma/client';

interface LogParams {
  userId?: string;
  action: AuditAction;
  entity: AuditEntity;
  entityId: string;
  entityName?: string;
  before?: object;
  after?: object;
}

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(params: LogParams) {
    return this.prisma.auditLog.create({
      data: {
        userId: params.userId,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        entityName: params.entityName,
        before: params.before ?? undefined,
        after: params.after ?? undefined,
      },
    });
  }

  async findAll(params: {
    entity?: AuditEntity;
    entityId?: string;
    userId?: string;
    limit?: number;
    offset?: number;
  }) {
    const { entity, entityId, userId, limit = 50, offset = 0 } = params;
    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: {
          ...(entity && { entity }),
          ...(entityId && { entityId }),
          ...(userId && { userId }),
        },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, role: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.auditLog.count({
        where: {
          ...(entity && { entity }),
          ...(entityId && { entityId }),
          ...(userId && { userId }),
        },
      }),
    ]);
    return { logs, total };
  }
}
