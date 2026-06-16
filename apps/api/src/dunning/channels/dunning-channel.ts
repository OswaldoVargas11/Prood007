import type { DunningChannel, DunningSeverity } from '@legalflow/domain';

/** Token de inyección para la lista de canales de entrega disponibles (multi-provider). */
export const DUNNING_CHANNELS = 'DUNNING_CHANNELS';

/** Datos que el motor entrega a un canal para que comunique el recordatorio. */
export interface DunningDeliveryInput {
  tenantId: string;
  invoice: { id: string; number: string; total: string; currency: string; dueDate: Date | null };
  client: { id: string; name: string };
  severity: DunningSeverity;
  offsetDays: number;
}

/**
 * Punto de integración CANAL-AGNÓSTICO del dunning. Hoy solo existe el canal IN_APP; EMAIL/SMS se
 * implementan en Fase 2 añadiendo nuevos dispatchers SIN tocar el motor: basta con registrarlos en el
 * multi-provider `DUNNING_CHANNELS` y el motor los selecciona por `rule.channel`.
 */
export interface DunningChannelDispatcher {
  readonly channel: DunningChannel;
  /** Si el canal está operativo (p. ej. EMAIL deshabilitado hasta tener proveedor en Fase 2). */
  isEnabled(): boolean;
  deliver(input: DunningDeliveryInput): Promise<void>;
}
