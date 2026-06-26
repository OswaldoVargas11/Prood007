import type { ReactNode } from 'react';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Newsreader } from 'next/font/google';
import { routing } from '@/i18n/routing';
import { SITE_URL } from '@/lib/site';
import { Providers } from '@/app/providers';
import { ServiceWorkerRegister } from '@/components/lexora/service-worker-register';
import '../globals.css';

/** Serif editorial (Newsreader) — solo lo usa la landing pública (titulares "Sello"). Autohospedada
 * vía next/font; expone `--font-newsreader`, que la landing mapea a `--serif`. */
const newsreader = Newsreader({
  subsets: ['latin'],
  weight: ['400', '500'],
  style: ['normal', 'italic'],
  variable: '--font-newsreader',
  display: 'swap',
});

export const metadata: Metadata = {
  // Base para resolver URLs relativas (canonical, og:image…) a absolutas.
  metadataBase: new URL(SITE_URL),
  title: {
    default: 'Lawzora · Software de gestión para despachos de abogados',
    // Cada página pone su nombre y se le añade la marca: "Tarifas" → "Tarifas · Lawzora".
    template: '%s · Lawzora',
  },
  description:
    'Software de gestión para despachos de abogados en España y República Dominicana: expedientes, facturación electrónica (e-CF/Verifactu), agenda procesal, clientes, documentos y firma.',
  applicationName: 'Lawzora',
  keywords: [
    'software para abogados',
    'gestión de despachos',
    'software jurídico',
    'facturación electrónica abogados',
    'expedientes legales',
    'legaltech España',
    'software legal República Dominicana',
  ],
  authors: [{ name: 'Lawzora' }],
  icons: { icon: '/lawzora-mark.svg' },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Lawzora' },
  // Por defecto indexable; las áreas privadas ya rebotan a /login y no son rastreables.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  openGraph: {
    type: 'website',
    siteName: 'Lawzora',
    locale: 'es_ES',
    url: '/es',
    title: 'Lawzora · Software de gestión para despachos de abogados',
    description:
      'La plataforma para gestionar tu despacho en España y República Dominicana: expedientes, facturación electrónica, agenda y clientes.',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Lawzora · Software de gestión para despachos de abogados',
    description:
      'La plataforma para gestionar tu despacho en España y República Dominicana: expedientes, facturación electrónica, agenda y clientes.',
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#fafbfb' },
    { media: '(prefers-color-scheme: dark)', color: '#14181b' },
  ],
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!routing.locales.includes(locale as (typeof routing.locales)[number])) {
    notFound();
  }
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${newsreader.variable}`}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <Providers>{children}</Providers>
          <ServiceWorkerRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
