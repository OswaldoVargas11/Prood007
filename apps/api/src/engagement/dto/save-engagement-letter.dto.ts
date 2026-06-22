import { IsString, MaxLength, MinLength } from 'class-validator';

/** Alta/edición de la hoja de encargo de un expediente (alcance, honorarios, términos). */
export class SaveEngagementLetterDto {
  @IsString()
  matterId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  scope!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  fees!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  terms!: string;
}
