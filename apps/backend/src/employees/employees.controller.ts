import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards, ParseFloatPipe } from '@nestjs/common';
import { EmployeesService } from './employees.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';
import { AssignDepartmentDto } from './dto/assign-department.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('employees')
@UseGuards(JwtAuthGuard)
export class EmployeesController {
  constructor(private service: EmployeesService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.service.findAll(all === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateEmployeeDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeDto, @CurrentUser() user: any) {
    return this.service.update(id, dto, user?.id);
  }

  @Patch(':id/disable')
  @UseGuards(RolesGuard)
  @Roles('admin')
  disable(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.disable(id, false, user?.id);
  }

  @Patch(':id/enable')
  @UseGuards(RolesGuard)
  @Roles('admin')
  enable(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.disable(id, true, user?.id);
  }

  @Delete(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.service.remove(id, user?.id);
  }

  @Patch(':id/hourly-rate')
  @UseGuards(RolesGuard)
  @Roles('admin', 'hr')
  updateHourlyRate(
    @Param('id') id: string,
    @Body('hourlyRate', ParseFloatPipe) hourlyRate: number,
    @CurrentUser() user: any,
  ) {
    return this.service.update(id, { hourlyRate } as any, user?.id);
  }

  @Post(':id/assign-department')
  @UseGuards(RolesGuard)
  @Roles('admin')
  assignDepartment(@Param('id') id: string, @Body() dto: AssignDepartmentDto, @CurrentUser() user: any) {
    return this.service.assignDepartment(id, dto, user?.id);
  }
}
