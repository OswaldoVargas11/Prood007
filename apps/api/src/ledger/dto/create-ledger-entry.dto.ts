import { IsEnum, IsNumberString, IsString, MaxLength, MinLength } from 'class-validator';
import { LedgerEntryType } from '@legalflow/domain';

/** Tipos de apunte que un usuario puede crear manualmente (no TIME_FEE ni INVOICE, que son del sistema). */
export const MANUAL_LEDGER_TYPES = [
  LedgerEntryType.PROVISION,
  LedgerEntryType.DISBURSEMENT,
  LedgerEntryType.FEE,
  LedgerEntryType.PAYMENT,
  LedgerEntryType.ADJUSTMENT,
] as const;

export class CreateLedgerEntryDto {
  @IsString()
  matterId!: string;

  @IsEnum(LedgerEntryType)
  type!: LedgerEntryType;

  /** Importe como string decimal (p. ej. "150.00"). Se valida el signo en el servicio. */
  @IsNumberString()
  amount!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(300)
  description!: string;
}
