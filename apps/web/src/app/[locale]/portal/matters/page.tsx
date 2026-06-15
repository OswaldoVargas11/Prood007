import { redirect } from 'next/navigation';

/**
 * El portal no tiene índice propio de expedientes: las tarjetas enlazan directo a
 * `/portal/matters/[id]`. Teclear `/portal/matters` a pelo llevaba a un 404 crudo; lo
 * redirigimos al landing del portal, que ya lista los expedientes del cliente.
 */
export default async function PortalMattersIndex({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale}/portal`);
}
