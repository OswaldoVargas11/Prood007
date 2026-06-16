import { DunningChannel, DunningSeverity, Jurisdiction } from '@legalflow/domain';

/** Forma de una regla efectiva del calendario de dunning (sin persistir). */
export interface DunningRuleShape {
  offsetDays: number;
  severity: DunningSeverity;
  channel: DunningChannel;
}

/**
 * Calendario de dunning por defecto cuando el despacho no ha configurado reglas propias
 * (`DunningRule`): +1 recordatorio, +7 aviso, +15 aviso final. El escalado sube de severidad con el
 * retraso. Mismo calendario para ES y RD por ahora — el tono/idioma se localiza en la UI por `locale`;
 * la jurisdicción se recibe para permitir divergencias futuras sin cambiar la firma.
 */
export function defaultDunningRules(_jurisdiction: Jurisdiction): DunningRuleShape[] {
  return [
    { offsetDays: 1, severity: DunningSeverity.REMINDER, channel: DunningChannel.IN_APP },
    { offsetDays: 7, severity: DunningSeverity.WARNING, channel: DunningChannel.IN_APP },
    { offsetDays: 15, severity: DunningSeverity.FINAL, channel: DunningChannel.IN_APP },
  ];
}
