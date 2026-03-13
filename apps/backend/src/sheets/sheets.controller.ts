import { Controller, Get, Post, Patch, Param, Body, Query, UseGuards } from '@nestjs/common';
import { SheetsService } from './sheets.service';
import { CreateSheetDto } from './dto/create-sheet.dto';
import { UpsertEntryDto } from './dto/upsert-entry.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('sheets')
@UseGuards(JwtAuthGuard)
export class SheetsController {
  constructor(private service: SheetsService) {}

  @Get()
  findAll(
    @Query('year') year?: string,
    @Query('month') month?: string,
    @Query('departmentId') departmentId?: string,
    @Query('status') status?: any,
  ) {
    return this.service.findAll({
      year: year ? +year : undefined,
      month: month ? +month : undefined,
      departmentId,
      status,
    });
  }

  @Get('working-days')
  getWorkingDays(@Query('year') year: string, @Query('month') month: string) {
    return this.service.getWorkingDays(+year, +month);
  }

  @Get('employees-suggestion')
  getEmployeesSuggestion(
    @Query('departmentId') departmentId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.service.getEmployeesSuggestion(departmentId, +year, +month);
  }

  @Get('payroll')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  getPayrollView(@Query('year') year: string, @Query('month') month: string) {
    return this.service.getPayrollView(+year, +month);
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  create(@Body() dto: CreateSheetDto, @CurrentUser() user: any) {
    return this.service.create(dto, user.id);
  }

  @Post(':id/entries')
  upsertEntry(@Param('id') sheetId: string, @Body() dto: UpsertEntryDto) {
    return this.service.upsertEntry(sheetId, dto);
  }

  @Patch(':id/submit')
  submit(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.submit(id, user.id);
  }

  @Patch(':id/lock')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  lock(@Param('id') id: string) {
    return this.service.lock(id);
  }

  @Patch(':id/reopen')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  reopen(@Param('id') id: string) {
    return this.service.reopen(id);
  }

  @Patch(':id/employee-rate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  upsertEmployeeRealRate(
    @Param('id') sheetId: string,
    @Body('employeeId') employeeId: string,
    @Body('realRate') realRate: number,
    @CurrentUser() user: any,
  ) {
    return this.service.upsertEmployeeRealRate(sheetId, employeeId, realRate, user.id);
  }
}
