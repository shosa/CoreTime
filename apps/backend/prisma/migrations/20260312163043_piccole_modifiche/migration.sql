-- DropIndex
DROP INDEX `audit_logs_entity_id_idx` ON `audit_logs`;

-- DropIndex
DROP INDEX `audit_logs_entity_idx` ON `audit_logs`;

-- AlterTable
ALTER TABLE `audit_logs` MODIFY `entity` ENUM('employee', 'department', 'sheet', 'entry', 'user') NOT NULL;

-- CreateIndex
CREATE INDEX `audit_logs_entity_entity_id_idx` ON `audit_logs`(`entity`, `entity_id`);
