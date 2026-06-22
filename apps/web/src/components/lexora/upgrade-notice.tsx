'use client';

import { useTranslations } from 'next-intl';
import { Lock } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Aviso de función no incluida en el plan, con CTA para mejorar. Se muestra en lugar del contenido de
 * una pestaña/sección bloqueada (UX "visible pero bloqueada"). `tier` es el plan que la desbloquea.
 */
export function UpgradeNotice({ feature, tier }: { feature: string; tier?: string }) {
  const t = useTranslations('entitlements');
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center gap-3 py-10 text-center">
        <span className="flex size-10 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
          <Lock className="size-5" />
        </span>
        <div className="space-y-1">
          <p className="font-medium">{t('lockedTitle', { feature })}</p>
          <p className="text-sm text-muted-foreground">
            {tier ? t('lockedBodyTier', { tier }) : t('lockedBody')}
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/subscription">{t('cta')}</Link>
        </Button>
      </CardContent>
    </Card>
  );
}

/** Versión compacta (badge con candado) para pestañas/elementos de nav bloqueados. */
export function LockBadge() {
  return <Lock className="size-3.5 text-muted-foreground" aria-hidden />;
}
