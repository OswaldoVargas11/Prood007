import { Injectable } from '@nestjs/common';
import { AccountType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestUser } from '../auth/auth.types';

/** Tratamiento fiscal de la suscripción de Lawzora (sociedad ES) según el perfil y país del cliente. */
export type TaxTreatment =
  | 'IVA_ES'
  | 'REVERSE_CHARGE_EU'
  | 'OSS_EU'
  | 'NOT_SUBJECT_EXPORT'
  | 'ITBIS_RD';

export interface TaxClassification {
  audience: 'B2B' | 'B2C';
  treatment: TaxTreatment;
  /** Tipo aplicable conocido (null cuando depende del país de consumo, p. ej. OSS). */
  ratePercent: number | null;
  note: string;
}

// Estados miembro de la UE (incluye ES). Determina reverse-charge (B2B) y OSS (B2C).
const EU = new Set([
  'AT',
  'BE',
  'BG',
  'HR',
  'CY',
  'CZ',
  'DK',
  'EE',
  'FI',
  'FR',
  'DE',
  'GR',
  'HU',
  'IE',
  'IT',
  'LV',
  'LT',
  'LU',
  'MT',
  'NL',
  'PL',
  'PT',
  'RO',
  'SK',
  'SI',
  'ES',
  'SE',
]);

/**
 * Clasifica el IVA/ITBIS de la suscripción que cobra Lawzora (sociedad española), determinado por el
 * PERFIL y el PAÍS del cliente — nunca por geolocalización ni divisa. Es la fuente de verdad de la decisión
 * fiscal; conectarla al cobro real (Stripe) es un paso posterior verificado contra facturación.
 */
export function classifyTax(input: {
  accountType: AccountType;
  country: string;
  hasTaxId: boolean;
}): TaxClassification {
  const c = (input.country || '').toUpperCase();
  const business = input.accountType !== AccountType.CONSUMER && input.hasTaxId;

  if (business) {
    if (c === 'ES') {
      return {
        audience: 'B2B',
        treatment: 'IVA_ES',
        ratePercent: 21,
        note: 'Operación interior: 21% IVA.',
      };
    }
    if (EU.has(c)) {
      return {
        audience: 'B2B',
        treatment: 'REVERSE_CHARGE_EU',
        ratePercent: 0,
        note: 'Inversión del sujeto pasivo: el cliente autoliquida el IVA en su país.',
      };
    }
    return {
      audience: 'B2B',
      treatment: 'NOT_SUBJECT_EXPORT',
      ratePercent: null,
      note: 'Exportación de servicios: no sujeta a IVA español (art. 69.Uno.1º LIVA).',
    };
  }

  // Consumidor (B2C).
  if (c === 'ES') {
    return {
      audience: 'B2C',
      treatment: 'IVA_ES',
      ratePercent: 21,
      note: 'Consumidor en España: 21% IVA.',
    };
  }
  if (EU.has(c)) {
    return {
      audience: 'B2C',
      treatment: 'OSS_EU',
      ratePercent: null,
      note: 'Consumidor UE: IVA del país de consumo vía ventanilla única (OSS).',
    };
  }
  if (c === 'DO') {
    return {
      audience: 'B2C',
      treatment: 'ITBIS_RD',
      ratePercent: 18,
      note: 'Consumidor en RD: ITBIS 18% (Decreto 30-25, proveedor digital extranjero).',
    };
  }
  return {
    audience: 'B2C',
    treatment: 'NOT_SUBJECT_EXPORT',
    ratePercent: null,
    note: 'Consumidor fuera de la UE: no sujeto a IVA español.',
  };
}

@Injectable()
export class TaxService {
  constructor(private readonly prisma: PrismaService) {}

  /** Clasificación fiscal de la suscripción para el tenant actual (perfil + país declarado, no IP/divisa). */
  async classifyForTenant(user: RequestUser): Promise<TaxClassification & { country: string }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { accountType: true, fiscalCountry: true, jurisdiction: true, taxId: true },
    });
    const country = tenant?.fiscalCountry || (tenant?.jurisdiction === 'do' ? 'DO' : 'ES');
    const classification = classifyTax({
      accountType: tenant?.accountType ?? AccountType.FIRM,
      country,
      hasTaxId: Boolean(tenant?.taxId),
    });
    return { ...classification, country };
  }
}
