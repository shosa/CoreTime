import { Controller, Get, Post, Patch, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { DepartmentsService } from './departments.service';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@Controller('departments')
@UseGuards(JwtAuthGuard)
export class DepartmentsController {
  constructor(private service: DepartmentsService) {}

  @Get()
  findAll(@Query('all') all?: string) {
    return this.service.findAll(all === 'true');
  }

  @Get(':id')
  findOne(@Param('id') id: string) { return this.service.findOne(id); }

  @Post()
  @UseGuards(RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreateDepartmentDto, @CurrentUser() user: any) {
    return this.service.create(dto, user?.id);
  }

  @Patch(':id')
  @UseGuards(RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdateDepartmentDto, @CurrentUser() user: any) {
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
}
