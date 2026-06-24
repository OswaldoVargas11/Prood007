import { IsOptional, IsString, MaxLength, MinLength, ValidateIf } from 'class-validator';

/** Renombrar (`name`) y/o mover (`parentId`: id de la carpeta destino, o `null` para la raíz). */
export class UpdateFolderDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  // `undefined` = no mover; `null` = mover a la raíz; string = mover dentro de esa carpeta.
  @ValidateIf((o) => o.parentId !== null && o.parentId !== undefined)
  @IsString()
  parentId?: string | null;
}
