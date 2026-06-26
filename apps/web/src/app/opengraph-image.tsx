import { ImageResponse } from 'next/og';

/**
 * Imagen de Open Graph / Twitter Card del sitio (1200×630), generada por `next/og`. Por la convención
 * de fichero en la raíz de `app`, Next la añade como `og:image`/`twitter:image` a TODAS las páginas, así
 * que al compartir cualquier URL en redes/buscadores sale una tarjeta de marca en vez de nada.
 * Se dibuja con texto (sin fuentes externas ni assets binarios) para que el build sea autónomo.
 */
export const alt = 'Lawzora · Software de gestión para despachos de abogados';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        padding: '80px',
        background: 'linear-gradient(135deg, #1e1b4b 0%, #4f46e5 100%)',
        color: '#ffffff',
        fontFamily: 'sans-serif',
      }}
    >
      <div style={{ fontSize: 92, fontWeight: 700, letterSpacing: '-0.03em' }}>Lawzora</div>
      <div style={{ fontSize: 44, marginTop: 24, lineHeight: 1.25, color: '#e0e7ff' }}>
        Software de gestión para despachos de abogados
      </div>
      <div style={{ fontSize: 30, marginTop: 36, color: '#c7d2fe' }}>
        España · República Dominicana
      </div>
    </div>,
    { ...size },
  );
}
