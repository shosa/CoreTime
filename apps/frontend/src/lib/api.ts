import api from './axios';

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const authApi = {
  login: (email: string, password: string) =>
    api.post('/auth/login', { email, password }).then((r) => r.data),
  me: () => api.get('/auth/me').then((r) => r.data),
};

// ─── Users ────────────────────────────────────────────────────────────────────
export const usersApi = {
  list: () => api.get('/users').then((r) => r.data),
  get: (id: string) => api.get(`/users/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/users', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data).then((r) => r.data),
  remove: (id: string) => api.delete(`/users/${id}`).then((r) => r.data),
};

// ─── Departments ──────────────────────────────────────────────────────────────
export const departmentsApi = {
  list: (all = false) => api.get(`/departments${all ? '?all=true' : ''}`).then((r) => r.data),
  get: (id: string) => api.get(`/departments/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/departments', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/departments/${id}`, data).then((r) => r.data),
  disable: (id: string) => api.patch(`/departments/${id}/disable`).then((r) => r.data),
  enable: (id: string) => api.patch(`/departments/${id}/enable`).then((r) => r.data),
  remove: (id: string) => api.delete(`/departments/${id}`).then((r) => r.data),
};

// ─── Employees ────────────────────────────────────────────────────────────────
export const employeesApi = {
  list: (all = false) => api.get(`/employees${all ? '?all=true' : ''}`).then((r) => r.data),
  get: (id: string) => api.get(`/employees/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/employees', data).then((r) => r.data),
  update: (id: string, data: any) => api.patch(`/employees/${id}`, data).then((r) => r.data),
  disable: (id: string) => api.patch(`/employees/${id}/disable`).then((r) => r.data),
  enable: (id: string) => api.patch(`/employees/${id}/enable`).then((r) => r.data),
  remove: (id: string) => api.delete(`/employees/${id}`).then((r) => r.data),
  assignDepartment: (id: string, data: any) =>
    api.post(`/employees/${id}/assign-department`, data).then((r) => r.data),
  updateHourlyRate: (id: string, hourlyRate: number) =>
    api.patch(`/employees/${id}/hourly-rate`, { hourlyRate }).then((r) => r.data),
};

// ─── Audit ────────────────────────────────────────────────────────────────────
export const auditApi = {
  list: (params?: { entity?: string; entityId?: string; userId?: string; limit?: number; offset?: number }) =>
    api.get('/audit', { params }).then((r) => r.data),
};

// ─── Sheets ───────────────────────────────────────────────────────────────────
export const sheetsApi = {
  list: (params?: { year?: number; month?: number; departmentId?: string; status?: string }) =>
    api.get('/sheets', { params }).then((r) => r.data),
  get: (id: string) => api.get(`/sheets/${id}`).then((r) => r.data),
  create: (data: any) => api.post('/sheets', data).then((r) => r.data),
  upsertEntry: (sheetId: string, data: any) =>
    api.post(`/sheets/${sheetId}/entries`, data).then((r) => r.data),
  submit: (id: string) => api.patch(`/sheets/${id}/submit`).then((r) => r.data),
  lock: (id: string) => api.patch(`/sheets/${id}/lock`).then((r) => r.data),
  reopen: (id: string) => api.patch(`/sheets/${id}/reopen`).then((r) => r.data),
  getWorkingDays: (year: number, month: number) =>
    api.get('/sheets/working-days', { params: { year, month } }).then((r) => r.data),
  getPayrollView: (year: number, month: number) =>
    api.get('/sheets/payroll', { params: { year, month } }).then((r) => r.data),
  getEmployeesSuggestion: (departmentId: string, year: number, month: number) =>
    api.get('/sheets/employees-suggestion', { params: { departmentId, year, month } }).then((r) => r.data),
  upsertEmployeeRate: (sheetId: string, employeeId: string, realRate: number) =>
    api.patch(`/sheets/${sheetId}/employee-rate`, { employeeId, realRate }).then((r) => r.data),
};

// ─── Export ───────────────────────────────────────────────────────────────────
export const exportApi = {
  downloadBlank: (sheetId: string) =>
    api.get(`/export/sheets/${sheetId}/blank`, { responseType: 'blob' }).then((r) => r.data),
  downloadFilled: (sheetId: string) =>
    api.get(`/export/sheets/${sheetId}/filled`, { responseType: 'blob' }).then((r) => r.data),
  downloadPayroll: (sheetId: string) =>
    api.get(`/export/sheets/${sheetId}/payroll`, { responseType: 'blob' }).then((r) => r.data),
};
