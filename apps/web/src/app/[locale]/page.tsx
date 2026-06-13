import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('home');
  const tApp = useTranslations('app');

  return (
    <main className="mx-auto max-w-2xl p-10">
      <h1 className="text-3xl font-bold">{tApp('name')}</h1>
      <p className="mt-1 text-gray-500">{tApp('tagline')}</p>
      <section className="mt-8 space-y-2">
        <h2 className="text-xl font-semibold">{t('welcome')}</h2>
        <ul className="list-disc pl-6 text-gray-700">
          <li>{t('jurisdiction')}</li>
          <li>{t('billing')}</li>
          <li>{t('currency')}</li>
        </ul>
      </section>
    </main>
  );
}
