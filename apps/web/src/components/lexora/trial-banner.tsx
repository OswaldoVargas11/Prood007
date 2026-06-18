'use client';

import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import { Link } from '@/i18n/navigation';

/** Banner de prueba: "Te quedan X días · Suscríbete". Se muestra arriba mientras el despacho prueba. */
export function TrialBanner({ daysLeft }: { daysLeft: number }) {
  const t = useTranslations('subscription');
  return (
    <div className="flex flex-wrap items-center justify-center gap-2 border-b bg-[var(--brand-soft)] px-4 py-2 text-[13px] text-[var(--brand)]">
      <Sparkles className="size-4" />
      <span className="font-medium">{t('bannerTrial', { days: daysLeft })}</span>
      <Link href="/subscription" className="font-semibold underline underline-offset-2">
        {t('bannerCta')}
      </Link>
    </div>
  );
}
