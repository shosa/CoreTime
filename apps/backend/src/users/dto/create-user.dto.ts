import { IsEmail, IsEnum, IsString, MinLength } from 'class-validator';
import { UserRole } from '../../types';

export class CreateUserDto {
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsEnum(['admin','hr','supervisor'])
  role: UserRole;
}
