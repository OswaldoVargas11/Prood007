import { ArrayMaxSize, IsArray, IsString, MaxLength, MinLength } from 'class-validator';

/** Alta de un paquete de plantillas reutilizable del despacho. */
export class CreateDocumentPackageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name!: string;

  @IsArray()
  @ArrayMaxSize(30)
  @IsString({ each: true })
  templateIds!: string[];
}
