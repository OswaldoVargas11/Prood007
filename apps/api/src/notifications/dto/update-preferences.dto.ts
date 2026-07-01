import { IsBoolean, IsOptional } from 'class-validator';

/** Preferencias de notificación que el propio usuario puede cambiar (self-service). Campos opcionales:
 *  el cliente envía solo los que cambia (patch parcial). */
export class UpdateNotificationPreferencesDto {
  /** Recibir (o no) los recordatorios de plazos por correo. El aviso in-app no se ve afectado. */
  @IsOptional()
  @IsBoolean()
  deadlineEmailRemindersEnabled?: boolean;

  /** OPT-IN: recibir (o no) el resumen por correo de mensajes de chat sin leer (NEXT 1.1). */
  @IsOptional()
  @IsBoolean()
  chatDigestEmailEnabled?: boolean;
}
