/**
 * Registro de los 3 escenarios de demo. Identidad COMPARTIDA por el seed y el reset (mismos emails),
 * para que `reset:demo` borre exactamente lo que `seed:demo` crea. Cada escenario = su propio tenant
 * AISLADO. Todos los emails van en el dominio reservado `@demo.legalflow.invalid`.
 */
import { cif } from '../lib/identifiers.mjs';

export const SCENARIOS = {
  1: {
    key: 'mna',
    label: 'Boutique de M&A — compraventa de participaciones a medio cierre',
    name: 'Quórum Corporate Abogados',
    adminEmail: 'mna@demo.legalflow.invalid',
    adminName: 'Elena Vázquez Ortiz',
    jurisdiction: 'es',
    currency: 'EUR',
    taxId: cif(8810017),
    invoiceSeries: 'QM',
    adminRate: '320.00',
    lawyers: [
      {
        email: 'mna.asociado1@demo.legalflow.invalid',
        fullName: 'Daniel Centeno Mar',
        billRate: '210.00',
      },
      {
        email: 'mna.asociado2@demo.legalflow.invalid',
        fullName: 'Paula Iribarren Gil',
        billRate: '190.00',
      },
    ],
    loader: () => import('./scenario-1-mna.mjs'),
  },
  2: {
    key: 'realestate',
    label: 'Despacho inmobiliario — compraventa con due diligence en curso',
    name: 'Solar & Lonja Abogados Inmobiliario',
    adminEmail: 'inmobiliaria@demo.legalflow.invalid',
    adminName: 'Ignacio Roldán Suárez',
    jurisdiction: 'es',
    currency: 'EUR',
    taxId: cif(7720026),
    invoiceSeries: 'SL',
    adminRate: '240.00',
    lawyers: [
      {
        email: 're.asociado1@demo.legalflow.invalid',
        fullName: 'Cristina Bravo León',
        billRate: '170.00',
      },
      {
        email: 're.asociado2@demo.legalflow.invalid',
        fullName: 'Hugo Marín Castaño',
        billRate: '160.00',
      },
    ],
    loader: () => import('./scenario-2-realestate.mjs'),
  },
  3: {
    key: 'mercantil',
    label: 'Mercantil general — con secretaría de sociedades activa',
    name: 'Mercantia Asesores Legales',
    adminEmail: 'mercantil@demo.legalflow.invalid',
    adminName: 'Beatriz Quintana Robles',
    jurisdiction: 'es',
    currency: 'EUR',
    taxId: cif(6630035),
    invoiceSeries: 'MC',
    adminRate: '220.00',
    lawyers: [
      {
        email: 'mc.asociado1@demo.legalflow.invalid',
        fullName: 'Andrés Lozano Vidal',
        billRate: '160.00',
      },
      {
        email: 'mc.asociado2@demo.legalflow.invalid',
        fullName: 'Nuria Salas Bernal',
        billRate: '150.00',
      },
    ],
    loader: () => import('./scenario-3-mercantil.mjs'),
  },
};

/** Todos los emails de admin de las demos (para el reset global). */
export const ALL_DEMO_ADMIN_EMAILS = Object.values(SCENARIOS).map((s) => s.adminEmail);
