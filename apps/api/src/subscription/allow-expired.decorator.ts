import { SetMetadata } from '@nestjs/common';

export const ALLOW_EXPIRED_KEY = 'allowExpired';

/**
 * Marca una ruta como accesible AUNQUE la suscripción del despacho haya caducado (muro). Necesario en:
 * el propio estado de suscripción, el checkout/portal de pago, y las rutas de sesión (me/logout/refresh)
 * — si no, el despacho con prueba expirada no podría ni cargar la pantalla para suscribirse.
 */
export const AllowExpired = () => SetMetadata(ALLOW_EXPIRED_KEY, true);
