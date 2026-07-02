import { IsString } from 'class-validator';

/** Expediente sobre el que se emite el set de e-CF de prueba (cliente RD con RNC/cédula válidos). */
export class RunCertificationDto {
  @IsString()
  matterId!: string;
}
