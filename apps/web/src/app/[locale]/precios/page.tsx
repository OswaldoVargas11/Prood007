import type { Metadata } from 'next';
import { PricingStandalone } from '@/components/landing/pricing-standalone';

export const metadata: Metadata = {
  title: 'Precios',
  description:
    'Precios públicos de Lawzora para despachos de abogados. Tres planes (Esencial, Profesional, Avanzado) con ciclos mensual, anual y bienal. España (EUR) y República Dominicana (USD). Sin llamada de ventas.',
  alternates: { canonical: '/es/precios' },
  openGraph: {
    url: '/es/precios',
    title: 'Precios · Lawzora',
    description:
      'Tarifas por usuario, transparentes y sin sorpresas. Elige el plan que mejor encaja con tu despacho.',
  },
};

export default function PreciosPage() {
  return <PricingStandalone />;
}
