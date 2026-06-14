'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/lib/auth';
import { api } from '@/lib/api';

interface Page<T> {
  items: T[];
  total: number;
}

export default function DashboardPage() {
  const t = useTranslations('dashboard');
  const { user, loading, logout, hasRole } = useAuth();
  const router = useRouter();
  const { locale } = useParams<{ locale: string }>();
  const [clientsTotal, setClientsTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace(`/${locale}/login`);
  }, [loading, user, router, locale]);

  useEffect(() => {
    if (user && (hasRole('FIRM_ADMIN') || hasRole('LAWYER'))) {
      api
        .get<Page<unknown>>('/clients?pageSize=1')
        .then((p) => setClientsTotal(p.total))
        .catch(() => setClientsTotal(null));
    }
  }, [user, hasRole]);

  if (loading || !user) {
    return <main className="p-10 text-gray-500">{t('loading')}</main>;
  }

  return (
    <main className="mx-auto max-w-3xl p-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t('title')}</h1>
        <button onClick={() => void logout()} className="text-sm text-indigo-700 underline">
          {t('logout')}
        </button>
      </div>
      <dl className="mt-6 grid grid-cols-2 gap-4 text-sm">
        <div>
          <dt className="text-gray-500">{t('user')}</dt>
          <dd className="font-medium">{user.email}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{t('jurisdiction')}</dt>
          <dd className="font-medium">{user.jurisdiction.toUpperCase()}</dd>
        </div>
        <div>
          <dt className="text-gray-500">{t('roles')}</dt>
          <dd className="font-medium">{user.roles.join(', ')}</dd>
        </div>
        {clientsTotal !== null && (
          <div>
            <dt className="text-gray-500">{t('clients')}</dt>
            <dd className="font-medium">{clientsTotal}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-sm text-gray-400">{t('placeholder')}</p>
    </main>
  );
}
