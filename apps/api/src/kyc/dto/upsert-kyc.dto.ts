import { IsBoolean, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export const KYC_STATUSES = ['PENDING', 'IN_REVIEW', 'APPROVED', 'REJECTED'] as const;
export const KYC_RISKS = ['LOW', 'MEDIUM', 'HIGH'] as const;

/** Alta/edición del perfil KYC de un cliente (upsert). Todos los campos opcionales (parcial). */
export class UpsertKycDto {
  @IsOptional()
  @IsIn(KYC_STATUSES)
  status?: (typeof KYC_STATUSES)[number];

  @IsOptional()
  @IsIn(KYC_RISKS)
  risk?: (typeof KYC_RISKS)[number];

  @IsOptional()
  @IsBoolean()
  isPep?: boolean;

  @IsOptional()
  @IsBoolean()
  identityVerified?: boolean;

  @IsOptional()
  @IsBoolean()
  sanctionsChecked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  notes?: string;
}
