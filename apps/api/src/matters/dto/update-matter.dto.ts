import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class UpdateMatterDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  type?: string;

  @IsOptional()
  @IsString()
  lawyerId?: string;
}
