import { IsNotEmpty, IsString } from 'class-validator';

export class CreateFamilyAccountDto {
  @IsString()
  @IsNotEmpty()
  accountReference!: string;

  @IsString()
  @IsNotEmpty()
  displayName!: string;
}

export class CreateStudentDto {
  @IsString()
  @IsNotEmpty()
  studentReference!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;
}
