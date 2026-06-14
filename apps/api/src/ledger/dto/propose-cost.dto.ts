import { IsNumberString, IsOptional, IsString, MaxLength } from 'class-validator';

/** Un letrado propone un coste (suplido) que el administrador deberá aprobar antes de entrar al saldo. */
export class ProposeCostDto {
  @IsString()
  matterId!: string;

  @IsString()
  @MaxLength(300)
  description!: string;

  /** Importe positivo como string decimal (p. ej. "120.00"). */
  @IsNumberString()
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
