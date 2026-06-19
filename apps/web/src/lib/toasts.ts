import messages from '../../messages/es.json';

/**
 * Mensajes de confirmación (toast de éxito) tomados del catálogo `es.json`. La app es de un solo idioma
 * (`es`); estos textos son genéricos (no dependen de jurisdicción), así que se leen de la base. Se usan
 * en `meta.successToast` de las mutaciones; un handler global (providers) los muestra al completar.
 */
export const toastMsg = messages.toasts;
