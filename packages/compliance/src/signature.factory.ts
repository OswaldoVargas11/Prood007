/**
 * SignatureProviderFactory — selecciona el proveedor de FIRMA ELECTRÓNICA configurado (espejo de
 * `TaxSubmissionProviderFactory`). Único punto donde el núcleo "elige proveedor"; a partir de aquí
 * todo opera contra la interfaz `SignatureProvider`. Pluggable a DocuSign u otros añadiendo un caso.
 */
import type { SignatureProvider } from './signature.interface';
import { SignaturitSignatureProvider } from './providers/signaturit.signature';

/** Proveedores de firma soportados (configurables por `SIGNATURE_PROVIDER`). */
export type SignatureProviderName = 'signaturit';

export class SignatureProviderFactory {
  private static readonly cache = new Map<string, SignatureProvider>();

  static get(name: SignatureProviderName = 'signaturit'): SignatureProvider {
    const key = (name || 'signaturit').toLowerCase();
    const cached = this.cache.get(key);
    if (cached) return cached;

    let provider: SignatureProvider;
    switch (key) {
      case 'signaturit':
        provider = new SignaturitSignatureProvider();
        break;
      default:
        throw new Error(`No hay SignatureProvider para el proveedor: ${name}`);
    }
    this.cache.set(key, provider);
    return provider;
  }
}
