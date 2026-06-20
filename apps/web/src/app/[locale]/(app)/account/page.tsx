'use client';

import { useTranslations } from 'next-intl';
import { Bell, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useNotificationPreferences, useUpdateNotificationPreferences } from '@/lib/hooks';
import { ChangePasswordForm } from '@/components/lexora/change-password-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';

/** Cuenta del usuario del despacho (admin o letrado): contraseña + preferencias de notificación. */
export default function AccountPage() {
  const t = useTranslations('security');
  const { user } = useAuth();

  return (
    <div className="mx-auto max-w-[640px] space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{user?.email}</p>
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
      <NotificationsCard />
    </div>
  );
}

/** Preferencias de notificación del propio usuario: canal de correo de los recordatorios de plazos. */
function NotificationsCard() {
  const t = useTranslations('notificationPrefs');
  const { data, isLoading } = useNotificationPreferences();
  const update = useUpdateNotificationPreferences();
  const enabled = data?.deadlineEmailRemindersEnabled ?? true;

  return (
    <Card>
      <CardHeader className="flex-row items-center gap-3 space-y-0">
        <Bell className="size-5 text-[var(--brand)]" />
        <div>
          <CardTitle className="text-[15px]">{t('title')}</CardTitle>
          <p className="text-[12px] text-muted-foreground">{t('desc')}</p>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-10 w-full" />
        ) : (
          <div className="flex items-center justify-between gap-4 rounded-lg border bg-[var(--surface-1)] px-4 py-3">
            <div className="min-w-0">
              <div className="text-[13.5px] font-medium">{t('deadlineEmail')}</div>
              <p className="mt-0.5 text-[12px] text-muted-foreground">{t('deadlineEmailHint')}</p>
            </div>
            <Switch
              checked={enabled}
              disabled={update.isPending}
              aria-label={t('deadlineEmail')}
              onCheckedChange={(v) => update.mutate({ deadlineEmailRemindersEnabled: v })}
            />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
