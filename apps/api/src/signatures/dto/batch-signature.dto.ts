import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

/** Envía varias versiones de documento a firma de una vez (mismo firmante). */
export class BatchSignatureDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @IsString({ each: true })
  versionIds!: string[];

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  signerName!: string;

  @IsEmail()
  @MaxLength(320)
  signerEmail!: string;
}
