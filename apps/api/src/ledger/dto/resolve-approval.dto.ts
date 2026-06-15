import { IsOptional, IsString, MaxLength } from 'class-validator';

/** Nota opcional al aprobar/rechazar un coste propuesto. */
export class ResolveApprovalDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  note?: string;
}
