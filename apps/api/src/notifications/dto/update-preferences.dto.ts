import { IsBoolean } from 'class-validator';

/** Preferencias de notificación que el propio usuario puede cambiar (self-service). */
export class UpdateNotificationPreferencesDto {
  /** Recibir (o no) los recordatorios de plazos por correo. El aviso in-app no se ve afectado. */
  @IsBoolean()
  deadlineEmailRemindersEnabled!: boolean;
}
