import { PartialType } from '@nestjs/mapped-types';
import { CreateTemplateDto } from './create-template.dto';

/** Edición parcial de una plantilla. */
export class UpdateTemplateDto extends PartialType(CreateTemplateDto) {}
