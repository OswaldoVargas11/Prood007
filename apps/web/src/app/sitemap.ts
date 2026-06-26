import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * Sitemap del sitio público. Solo URLs indexables (apex `lawzora.com`, locale `es`): la landing y las
 * páginas legales. Las áreas privadas (/dashboard, /portal, /platform…) NO se incluyen: rebotan a
 * /login y no deben rastrearse. Disponible en https://lawzora.com/sitemap.xml y referenciado en
 * robots.txt (ver robots.ts).
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date('2026-06-26');
  return [
    {
      url: `${SITE_URL}/es`,
      lastModified,
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${SITE_URL}/es/privacy`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
    {
      url: `${SITE_URL}/es/terms`,
      lastModified,
      changeFrequency: 'yearly',
      priority: 0.3,
    },
  ];
}
