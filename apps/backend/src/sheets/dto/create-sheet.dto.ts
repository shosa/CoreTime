import { IsInt, IsString, Min, Max, IsOptional, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateSheetDto {
  @IsString()
  departmentId: string;

  @Type(() => Number)
  @IsInt()
  @Min(2020)
  year: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(12)
  month: number;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  employeeIds?: string[];
}
