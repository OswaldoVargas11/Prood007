'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { MailCheck, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useResendVerification } from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from './theme-toggle';

/**
 * Pantalla bloqueante: cuando el email no está confirmado (`emailVerified=false`), el usuario DEBE
 * confirmarlo antes de operar. "Ya lo confirmé" recarga el perfil (si verificó en otra pestaña, libera).
 */
export function ConfirmEmail() {
  const t = useTranslations('verify');
  const { user, logout, refreshUser } = useAuth();
  const resend = useResendVerification();
  const [checking, setChecking] = useState(false);
  const [sent, setSent] = useState(false);

  async function doResend() {
    try {
      await resend.mutateAsync();
      setSent(true);
      toast.success(t('resent'));
    } catch {
      toast.error(t('error'));
    }
  }
  async function recheck() {
    setChecking(true);
    try {
      await refreshUser();
    } finally {
      setChecking(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          background: 'radial-gradient(60% 50% at 50% 0%, var(--ai-from), transparent 70%)',
        }}
      />
      <div className="absolute right-5 top-5">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md shadow-lg">
        <CardHeader className="items-center text-center">
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-[var(--brand-soft)]">
            <MailCheck className="size-5 text-[var(--brand)]" />
          </div>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
          {user?.email && <p className="mt-1 text-[13px] font-medium">{user.email}</p>}
        </CardHeader>
        <CardContent className="space-y-2.5">
          <p className="text-center text-[13px] text-muted-foreground">{t('hint')}</p>
          <Button className="w-full" onClick={recheck} disabled={checking}>
            {checking ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('alreadyDone')}
          </Button>
          <Button
            variant="outline"
            className="w-full"
            onClick={doResend}
            disabled={resend.isPending || sent}
          >
            {resend.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {sent ? t('resentShort') : t('resend')}
          </Button>
          <button
            type="button"
            onClick={() => void logout()}
            className="block w-full pt-1 text-center text-xs text-muted-foreground hover:text-foreground hover:underline"
          >
            {t('logout')}
          </button>
        </CardContent>
      </Card>
    </main>
  );
}
