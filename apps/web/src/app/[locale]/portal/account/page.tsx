'use client';

import { useTranslations } from 'next-intl';
import { ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ChangePasswordForm } from '@/components/lexora/change-password-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/** Cuenta del cliente (portal): cambio de la contraseña que le facilitó el despacho. */
export default function PortalAccountPage() {
  const t = useTranslations('security');
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>
      <Card>
        <CardHeader className="flex-row items-center gap-3 space-y-0">
          <ShieldCheck className="size-5 text-[var(--brand)]" />
          <div>
            <CardTitle className="text-[15px]">{t('passwordTitle')}</CardTitle>
            <p className="text-[12px] text-muted-foreground">{t('passwordDesc')}</p>
          </div>
        </CardHeader>
        <CardContent>
          <ChangePasswordForm />
        </CardContent>
      </Card>
    </div>
  );
}
