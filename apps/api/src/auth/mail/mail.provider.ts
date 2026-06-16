import { Injectable, Logger } from '@nestjs/common';

/** Token de inyección del proveedor de correo (permite sustituir el stub por SMTP/Resend). */
export const MAIL_PROVIDER = Symbol('MAIL_PROVIDER');

/**
 * Contrato mínimo de envío de correo transaccional. Hoy solo se necesita el correo de recuperación
 * de contraseña; la interfaz deja cableado el camino por email sin acoplar a un proveedor concreto.
 */
export interface MailProvider {
  /** Envía al usuario el enlace de restablecimiento de contraseña. */
  sendPasswordReset(to: string, resetLink: string): Promise<void>;
}

/**
 * Implementación por defecto: NO envía correo (coherente con la decisión "in-app" del proyecto).
 * Registra la intención para trazabilidad en dev/CI. Para activar email real, registrar otro
 * proveedor bajo el token MAIL_PROVIDER. Ver SEC3.
 */
@Injectable()
export class NoopMailProvider implements MailProvider {
  private readonly logger = new Logger(NoopMailProvider.name);

  sendPasswordReset(to: string, resetLink: string): Promise<void> {
    // No se registra el token en claro en producción salvo nivel debug; el enlace lleva el secreto.
    this.logger.debug(`[mail:noop] reset de contraseña para ${to} → ${resetLink}`);
    return Promise.resolve();
  }
}
