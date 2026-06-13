import { IsEmail, IsOptional, IsString } from 'class-validator';

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  password!: string;

  /**
   * Necesario solo si el mismo email existe en varios despachos (tenants).
   * Si el email es único, puede omitirse.
   */
  @IsOptional()
  @IsString()
  tenantId?: string;
}
