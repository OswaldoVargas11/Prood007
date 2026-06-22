import {
  IsIn,
  IsISO8601,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';

export class CreateMinuteDto {
  @IsOptional()
  @IsIn(['GENERAL_MEETING', 'BOARD', 'OTHER'])
  kind?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsISO8601()
  meetingDate!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(20000)
  body!: string;
}

export class CreateShareholderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string;

  @IsInt()
  @Min(0)
  units!: number;
}

export class UpdateShareholderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  taxId?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  units?: number;
}

export class CreateTransferDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  fromName?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  toName!: string;

  @IsInt()
  @Min(1)
  units!: number;

  @IsISO8601()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  note?: string;
}

export class CreateObligationDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title!: string;

  @IsISO8601()
  dueDate!: string;

  @IsOptional()
  @IsIn(['NONE', 'ANNUAL'])
  recurrence?: string;
}

export class UpdateObligationDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsISO8601()
  dueDate?: string;

  @IsOptional()
  @IsIn(['NONE', 'ANNUAL'])
  recurrence?: string;

  @IsOptional()
  @IsIn(['PENDING', 'FILED'])
  status?: string;
}
