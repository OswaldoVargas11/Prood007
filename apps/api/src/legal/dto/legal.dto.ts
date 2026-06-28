import {
  IsArray,
  IsEnum,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { AcceptanceAct, AcceptanceMethod } from '@prisma/client';

/** Una aceptación dentro de la llamada: un documento + cómo se aceptó. */
export class AcceptItemDto {
  @IsString()
  documentId!: string;

  @IsOptional()
  @IsEnum(AcceptanceMethod)
  method?: AcceptanceMethod;

  @IsOptional()
  @IsEnum(AcceptanceAct)
  act?: AcceptanceAct;

  /** Para method=TYPED (firma simple). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  signerName?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  signerRole?: string;

  /** Para method=UPLOADED: documento firmado que sube el cliente. */
  @IsOptional()
  @IsString()
  evidenceDocId?: string;
}

export class AcceptDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AcceptItemDto)
  items!: AcceptItemDto[];

  /**
   * Snapshot determinista de lo mostrado al usuario al aceptar (microcopia del aviso, documentos enlazados y
   * sus versiones). Se guarda tal cual para reconstruir lo que vio. No es una imagen.
   */
  @IsOptional()
  @IsObject()
  shownSnapshot?: Record<string, unknown>;
}
