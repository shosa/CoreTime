export type UserRole = 'admin' | 'hr' | 'supervisor';
export type SheetStatus = 'draft' | 'submitted' | 'locked';
export type AuditAction = 'create' | 'update' | 'delete' | 'disable' | 'enable';
export type AuditEntity = 'employee' | 'department' | 'sheet' | 'entry' | 'user';

export const USER_ROLES: UserRole[] = ['admin', 'hr', 'supervisor'];
