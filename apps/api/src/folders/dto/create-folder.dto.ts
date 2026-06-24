import { IsEnum, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { FolderKind } from '@legalflow/domain';

/** Alta de una carpeta. `matterId` es obligatorio para kind=DOCUMENT y debe omitirse para TEMPLATE. */
export class CreateFolderDto {
  @IsEnum(FolderKind)
  kind!: FolderKind;

  @IsOptional()
  @IsString()
  matterId?: string;

  @IsOptional()
  @IsString()
  parentId?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;
}
