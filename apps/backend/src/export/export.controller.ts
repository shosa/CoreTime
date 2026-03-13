import { Controller, Get, Param, Res, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { ExportService } from './export.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@Controller('export')
@UseGuards(JwtAuthGuard)
export class ExportController {
  constructor(private exportService: ExportService) {}

  @Get('sheets/:id/blank')
  async downloadBlank(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.generateBlankSheet(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="foglio-presenze-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sheets/:id/filled')
  async downloadFilled(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.generateFilledSheet(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="presenze-compilate-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }

  @Get('sheets/:id/payroll')
  async downloadPayroll(@Param('id') id: string, @Res() res: Response) {
    const buffer = await this.exportService.generatePayrollReport(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="prospetto-paghe-${id}.pdf"`,
      'Content-Length': buffer.length,
    });
    res.end(buffer);
  }
}
