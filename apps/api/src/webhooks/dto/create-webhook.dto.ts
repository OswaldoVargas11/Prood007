import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsString, MaxLength } from 'class-validator';

/** Alta de un endpoint de webhook saliente. La URL se valida además contra SSRF en el servicio. */
export class CreateWebhookDto {
  @IsString()
  @MaxLength(2000)
  url!: string;

  /** Tipos de evento a suscribir (p. ej. ["matter.created"]). */
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  events!: string[];
}
