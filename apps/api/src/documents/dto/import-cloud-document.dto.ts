import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Proveedores de nube soportados para importar ficheros al expediente. */
export const CLOUD_PROVIDERS = ['google', 'microsoft'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

export class ImportCloudDocumentDto {
  @IsString()
  matterId!: string;

  @IsIn(CLOUD_PROVIDERS)
  provider!: CloudProvider;

  // Google Drive: identifica el fichero elegido en el Picker.
  @IsOptional()
  @IsString()
  @MaxLength(256)
  fileId?: string;

  // OneDrive / SharePoint: unidad + elemento elegidos en el explorador.
  @IsOptional()
  @IsString()
  @MaxLength(256)
  driveId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  itemId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
