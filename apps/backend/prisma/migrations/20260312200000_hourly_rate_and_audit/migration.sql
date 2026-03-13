-- Rename base_hours to hourly_rate with a default so existing rows are handled
ALTER TABLE `employees`
  ADD COLUMN `hourly_rate` DECIMAL(8, 2) NOT NULL DEFAULT 10.50,
  DROP COLUMN `base_hours`;

-- Remove the default after adding (Prisma manages this via schema)
ALTER TABLE `employees` ALTER COLUMN `hourly_rate` DROP DEFAULT;

-- CreateEnum AuditAction
ALTER TABLE `employees` MODIFY `hourly_rate` DECIMAL(8, 2) NOT NULL;

-- CreateTable audit_logs
CREATE TABLE `audit_logs` (
    `id` VARCHAR(191) NOT NULL,
    `user_id` VARCHAR(191) NULL,
    `action` ENUM('create', 'update', 'delete', 'disable', 'enable') NOT NULL,
    `entity` ENUM('user', 'department', 'employee', 'sheet', 'entry') NOT NULL,
    `entity_id` VARCHAR(191) NOT NULL,
    `entity_name` VARCHAR(200) NULL,
    `before` JSON NULL,
    `after` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `audit_logs_entity_idx`(`entity`),
    INDEX `audit_logs_entity_id_idx`(`entity_id`),
    INDEX `audit_logs_user_id_idx`(`user_id`),
    INDEX `audit_logs_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `audit_logs` ADD CONSTRAINT `audit_logs_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
