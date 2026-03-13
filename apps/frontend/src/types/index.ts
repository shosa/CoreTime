export type UserRole = 'admin' | 'hr' | 'supervisor';
export type SheetStatus = 'draft' | 'submitted' | 'locked';

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: UserRole;
  isActive: boolean;
  createdAt: string;
}

export interface Department {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface Employee {
  id: string;
  code: string;
  firstName: string;
  lastName: string;
  baseHours: number;
  isActive: boolean;
  departmentAssignments?: EmployeeDepartment[];
}

export interface EmployeeDepartment {
  id: string;
  employeeId: string;
  departmentId: string;
  assignedFrom: string;
  assignedTo: string | null;
  department: Department;
}

export interface AttendanceSheet {
  id: string;
  departmentId: string;
  year: number;
  month: number;
  status: SheetStatus;
  notes?: string;
  createdAt: string;
  department: Department;
  createdBy: { id: string; firstName: string; lastName: string };
  entries?: AttendanceEntry[];
}

export interface AttendanceEntry {
  id: string;
  sheetId: string;
  employeeId: string;
  day: number;
  ordinaryHours?: number;
  overtimeHours?: number;
  absenceCode?: string;
  notes?: string;
  employee: Employee;
}

export const MONTH_NAMES = [
  'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno',
  'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre',
];

export const ABSENCE_CODES = [
  { code: 'F', label: 'Ferie' },
  { code: 'M', label: 'Malattia' },
  { code: 'P', label: 'Permesso' },
  { code: 'FE', label: 'Festivo' },
  { code: 'AS', label: 'Assente' },
  { code: 'MAT', label: 'Maternità' },
];

export const SHEET_STATUS_LABELS: Record<SheetStatus, string> = {
  draft: 'Bozza',
  submitted: 'Inviato',
  locked: 'Bloccato',
};
