-- Remove real_rate from attendance_sheets (was per-sheet, now per-employee)
ALTER TABLE attendance_sheets DROP COLUMN IF EXISTS real_rate;

-- New table: per-employee real rate per sheet
CREATE TABLE sheet_employee_rates (
  id          VARCHAR(36) NOT NULL PRIMARY KEY,
  sheet_id    VARCHAR(36) NOT NULL,
  employee_id VARCHAR(36) NOT NULL,
  real_rate   DECIMAL(8,2) NOT NULL,
  UNIQUE KEY uq_sheet_employee (sheet_id, employee_id),
  KEY idx_sheet_id (sheet_id),
  CONSTRAINT fk_ser_sheet    FOREIGN KEY (sheet_id)    REFERENCES attendance_sheets(id) ON DELETE CASCADE,
  CONSTRAINT fk_ser_employee FOREIGN KEY (employee_id) REFERENCES employees(id)         ON DELETE CASCADE
);
