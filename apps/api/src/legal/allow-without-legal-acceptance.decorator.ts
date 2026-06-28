import { SetMetadata } from '@nestjs/common';

export const ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY = 'allowWithoutLegalAcceptance';

/**
 * Exime a un endpoint (o controlador) del gate de aceptación legal. Se usa en las rutas que DEBEN ser
 * alcanzables aunque el despacho no haya aceptado todavía: aceptar los documentos, autenticación/sesión y
 * la suscripción (pagar no exige DPA). Todo lo demás que ESCRIBA queda bloqueado hasta aceptar.
 */
export const AllowWithoutLegalAcceptance = () =>
  SetMetadata(ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY, true);
