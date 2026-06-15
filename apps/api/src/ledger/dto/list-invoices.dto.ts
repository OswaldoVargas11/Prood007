import { InvoiceStatus } from '@legalflow/domain';
import { IsEnum, IsIn, IsOptional } from 'class-validator';

/**
 * Filtros del listado global de facturas (`GET /ledger/invoices`).
 * - `status`: estado persistido exacto.
 * - `overdue=true`: deriva "vencida" en lectura desde `dueDate` (no depende del scheduler de dunning).
 */
export class ListInvoicesQueryDto {
  @IsOptional()
  @IsEnum(InvoiceStatus)
  status?: InvoiceStatus;

  @IsOptional()
  @IsIn(['true', 'false'])
  overdue?: string;
}
