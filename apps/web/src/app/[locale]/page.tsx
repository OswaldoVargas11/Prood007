import type { Metadata } from 'next';
import { Landing } from '@/components/landing/landing';

/**
 * SEO del home. `canonical: '/es'` evita el duplicado www/apex y fija la URL oficial (apex). El título
 * va `absolute` para no arrastrar el sufijo "· Lawzora" de la plantilla en la portada.
 */
export const metadata: Metadata = {
  title: { absolute: 'Lawzora · Software de gestión para despachos de abogados' },
  alternates: { canonical: '/es' },
  openGraph: { url: '/es' },
};

/**
 * Raíz pública: landing del producto. El middleware redirige a su home a quien ya tenga sesión, así que
 * aquí solo llegan visitantes anónimos. (Borrador — copy/precios pendientes de revisión del owner.)
 */
export default function Home() {
  return <Landing />;
}
