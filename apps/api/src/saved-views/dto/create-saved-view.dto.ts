import { IsIn, IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export const SAVED_VIEW_SCOPES = ['invoices', 'tasks', 'matters'] as const;
export type SavedViewScope = (typeof SAVED_VIEW_SCOPES)[number];

export class CreateSavedViewDto {
  @IsIn(SAVED_VIEW_SCOPES)
  scope!: SavedViewScope;

  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  /** Preset de filtros (opaco): el front guarda aquí su estado de filtros del listado. */
  @IsObject()
  filters!: Record<string, unknown>;
}
