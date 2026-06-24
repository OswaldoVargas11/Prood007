import { IsIn, IsInt, IsOptional, IsDateString, Min } from 'class-validator';

/** Tipos de e-CF de la DGII (RD) que un despacho puede emitir. 31 crédito fiscal · 32 consumo · 34 nota de crédito… */
export const ECF_TYPES = ['31', '32', '33', '34', '41', '43', '44', '45', '46', '47'] as const;

/** Registra (o re-registra) un rango de eNCF autorizado por la DGII para un tipo de comprobante. */
export class RegisterEcfSequenceDto {
  @IsIn(ECF_TYPES)
  ncfType!: (typeof ECF_TYPES)[number];

  @IsInt()
  @Min(1)
  rangeStart!: number;

  @IsInt()
  @Min(1)
  rangeEnd!: number;

  /** Fecha de vencimiento de la autorización (ISO). Opcional. */
  @IsOptional()
  @IsDateString()
  expiresAt?: string;
}
