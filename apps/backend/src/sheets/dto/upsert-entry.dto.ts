import { IsInt, IsNumber, IsOptional, IsString, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';

export class UpsertEntryDto {
  @IsString()
  employeeId: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(31)
  day: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  ordinaryHours?: number;

  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(24)
  overtimeHours?: number;

  // Codice assenza: F=Ferie, M=Malattia, P=Permesso, FE=Festivo, AS=Assente
  @IsOptional()
  @IsString()
  absenceCode?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
