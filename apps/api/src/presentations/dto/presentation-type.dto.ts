import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';
import { Jurisdiction } from '@legalflow/domain';

export class RequirementInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class TaskTemplateInputDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  offsetDays?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  order?: number;
}

export class CreatePresentationTypeDto {
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sector!: string;

  @IsOptional()
  @IsEnum(Jurisdiction)
  jurisdiction?: Jurisdiction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementInputDto)
  requirements?: RequirementInputDto[];

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskTemplateInputDto)
  taskTemplates?: TaskTemplateInputDto[];
}

export class UpdatePresentationTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  sector?: string;

  @IsOptional()
  @IsEnum(Jurisdiction)
  jurisdiction?: Jurisdiction;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  description?: string;

  // Si se envía, REEMPLAZA el conjunto de requisitos del tipo.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RequirementInputDto)
  requirements?: RequirementInputDto[];

  // Si se envía, REEMPLAZA el conjunto de plantillas de tarea del tipo.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TaskTemplateInputDto)
  taskTemplates?: TaskTemplateInputDto[];
}
