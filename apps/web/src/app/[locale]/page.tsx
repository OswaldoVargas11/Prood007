import { redirect } from 'next/navigation';

/** La raíz del locale lleva al panel; el middleware ya garantiza que haya sesión. */
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/dashboard`);
}
