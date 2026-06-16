import { IsOptional, IsString } from 'class-validator';

/** Filtros del listado de recordatorios de dunning. */
export class ListRemindersQueryDto {
  /** Acota a los recordatorios de una factura concreta (para su línea de tiempo). */
  @IsOptional()
  @IsString()
  invoiceId?: string;
}
