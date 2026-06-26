import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

/**
 * robots.txt generado por Next. Permite el rastreo del sitio público y referencia el sitemap (que es
 * lo que faltaba para que los buscadores descubran las URLs). Bloquea solo el BFF interno (`/api/`);
 * las áreas privadas ya rebotan a /login y no son indexables.
 *
 * NOTA: Cloudflare puede tener activado "Managed robots.txt" / bloqueo de bots de IA, que ANTEPONE su
 * bloque a este robots.txt. Es aditivo (sigue permitiendo a Googlebot/Bingbot), pero conviene confirmar
 * en el panel de Cloudflare que no lo sustituye por completo y que el `Sitemap:` queda visible.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
