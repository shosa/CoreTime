import { IsString, IsDateString } from 'class-validator';

export class AssignDepartmentDto {
  @IsString()
  departmentId: string;

  @IsDateString()
  assignedFrom: string; // YYYY-MM-DD
}
