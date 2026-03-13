import { Module } from '@nestjs/common';
import { ExportService } from './export.service';
import { ExportController } from './export.controller';
import { SheetsModule } from '../sheets/sheets.module';

@Module({
  imports: [SheetsModule],
  providers: [ExportService],
  controllers: [ExportController],
})
export class ExportModule {}
