import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/** Ensambla un paquete de documentos: varias plantillas a la vez en un expediente. */
export class GenerateFromTemplatesDto {
  @IsString()
  matterId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(30)
  @IsString({ each: true })
  templateIds!: string[];
}
