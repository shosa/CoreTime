-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'supervisor',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "employees" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "code" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "hourly_rate" DECIMAL NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "employee_departments" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "employee_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "assigned_from" DATETIME NOT NULL,
    "assigned_to" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "employee_departments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "employee_departments_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attendance_sheets" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "department_id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "notes" TEXT,
    "created_by_id" TEXT NOT NULL,
    "submitted_by_id" TEXT,
    "submitted_at" DATETIME,
    "locked_at" DATETIME,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "attendance_sheets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_sheets_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "attendance_sheets_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "sheet_employee_rates" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheet_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "real_rate" DECIMAL NOT NULL,
    CONSTRAINT "sheet_employee_rates_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "attendance_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "sheet_employee_rates_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "attendance_entries" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sheet_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "day" INTEGER NOT NULL,
    "ordinary_hours" DECIMAL,
    "overtime_hours" DECIMAL,
    "absence_code" TEXT,
    "notes" TEXT,
    "updated_at" DATETIME NOT NULL,
    CONSTRAINT "attendance_entries_sheet_id_fkey" FOREIGN KEY ("sheet_id") REFERENCES "attendance_sheets" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "attendance_entries_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "user_id" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "entity_name" TEXT,
    "before" TEXT,
    "after" TEXT,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "employees_code_key" ON "employees"("code");

-- CreateIndex
CREATE INDEX "employee_departments_employee_id_idx" ON "employee_departments"("employee_id");

-- CreateIndex
CREATE INDEX "employee_departments_department_id_idx" ON "employee_departments"("department_id");

-- CreateIndex
CREATE INDEX "employee_departments_assigned_from_idx" ON "employee_departments"("assigned_from");

-- CreateIndex
CREATE INDEX "attendance_sheets_year_month_idx" ON "attendance_sheets"("year", "month");

-- CreateIndex
CREATE INDEX "attendance_sheets_status_idx" ON "attendance_sheets"("status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_sheets_department_id_year_month_key" ON "attendance_sheets"("department_id", "year", "month");

-- CreateIndex
CREATE INDEX "sheet_employee_rates_sheet_id_idx" ON "sheet_employee_rates"("sheet_id");

-- CreateIndex
CREATE UNIQUE INDEX "sheet_employee_rates_sheet_id_employee_id_key" ON "sheet_employee_rates"("sheet_id", "employee_id");

-- CreateIndex
CREATE INDEX "attendance_entries_sheet_id_idx" ON "attendance_entries"("sheet_id");

-- CreateIndex
CREATE INDEX "attendance_entries_employee_id_idx" ON "attendance_entries"("employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_entries_sheet_id_employee_id_day_key" ON "attendance_entries"("sheet_id", "employee_id", "day");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");
