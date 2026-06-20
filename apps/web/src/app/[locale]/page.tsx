import { Landing } from '@/components/landing/landing';

/**
 * Raíz pública: landing del producto. El middleware redirige a su home a quien ya tenga sesión, así que
 * aquí solo llegan visitantes anónimos. (Borrador — copy/precios pendientes de revisión del owner.)
 */
export default function Home() {
  return <Landing />;
}
