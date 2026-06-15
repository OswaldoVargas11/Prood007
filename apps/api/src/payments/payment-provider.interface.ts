import type { Jurisdiction, PaymentMethod } from '@legalflow/domain';

/** Parámetros para crear una sesión de pago online (enlace de cobro). */
export interface PaymentCheckoutParams {
  invoiceId: string;
  invoiceNumber: string;
  tenantId: string;
  /** Cuenta conectada del despacho (Stripe Connect Standard) a la que va el cobro. */
  connectedAccountId: string;
  /** Importe a cobrar (saldo pendiente), como string decimal. */
  amount: string;
  currency: string;
  description: string;
  /** URLs de retorno del checkout (las fija el caller según el origen del despacho). */
  successUrl: string;
  cancelUrl: string;
}

/** Resultado de crear un checkout: enlace al que redirigir y referencia externa para conciliar. */
export interface PaymentCheckoutResult {
  url: string;
  providerRef: string;
}

/**
 * Adaptador de pasarela de pago, ENCHUFABLE por jurisdicción (espejo de `ComplianceProvider`). El
 * núcleo no conoce Stripe/Azul/CardNet: resuelve el provider de la jurisdicción del tenant y le pide
 * el checkout. El registro/conciliación del cobro (modelo `Payment`) es agnóstico y vive en
 * `PaymentsService`; el provider solo cubre la interacción con la pasarela externa. Ver D-024.
 */
export interface PaymentProvider {
  readonly jurisdiction: Jurisdiction;
  /** Método con el que se etiquetan los cobros online de este provider (p. ej. STRIPE). */
  readonly method: PaymentMethod;
  /** ¿Hay cobro online configurado y operativo? `false` ⇒ solo registro manual. */
  isOnlineEnabled(): boolean;
  /** Crea una sesión de pago online. Debe lanzar si `isOnlineEnabled()` es `false`. */
  createCheckout(params: PaymentCheckoutParams): Promise<PaymentCheckoutResult>;
}
