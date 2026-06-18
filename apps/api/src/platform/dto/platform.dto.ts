import { IsEmail, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class PlatformLoginDto {
  @IsEmail()
  @MaxLength(320)
  email!: string;

  @IsString()
  @MaxLength(200)
  password!: string;
}

export class ExtendTrialDto {
  /** Días a sumar a la prueba (desde hoy o desde el fin actual si aún no caducó). */
  @IsInt()
  @Min(1)
  @Max(365)
  days!: number;
}

export const MANAGEABLE_STATUSES = [
  'TRIALING',
  'ACTIVE',
  'PAST_DUE',
  'SUSPENDED',
  'CANCELED',
] as const;

export class SetSubscriptionDto {
  @IsIn(MANAGEABLE_STATUSES)
  status!: (typeof MANAGEABLE_STATUSES)[number];

  /** Plazas contratadas (al activar manualmente). Opcional. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1000)
  seats?: number;
}
