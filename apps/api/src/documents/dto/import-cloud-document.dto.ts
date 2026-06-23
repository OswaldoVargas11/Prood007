import { IsIn, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

/** Proveedores de nube soportados para importar ficheros al expediente. */
export const CLOUD_PROVIDERS = ['google', 'microsoft'] as const;
export type CloudProvider = (typeof CLOUD_PROVIDERS)[number];

// Ids opacos de los proveedores (Drive/Graph): alfanumérico + base64url + separadores habituales. Veta
// metacaracteres de path/URL en valores que luego se interpolan en las llamadas a la API del proveedor.
const CLOUD_ID = /^[\w.!~*'()+=:@%-]+$/;

export class ImportCloudDocumentDto {
  @IsString()
  matterId!: string;

  @IsIn(CLOUD_PROVIDERS)
  provider!: CloudProvider;

  // Google Drive: identifica el fichero elegido en el Picker.
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(CLOUD_ID)
  fileId?: string;

  // OneDrive / SharePoint: unidad + elemento elegidos en el explorador.
  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(CLOUD_ID)
  driveId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  @Matches(CLOUD_ID)
  itemId?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;
}
