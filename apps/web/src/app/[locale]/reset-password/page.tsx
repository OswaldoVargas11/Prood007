'use client';

import { Suspense, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useResetPassword } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { AuthShell } from '@/components/lexora/auth-shell';
import { cn } from '@/lib/utils';

const MIN_LEN = 10;

function ResetForm() {
  const t = useTranslations('security.reset');
  const params = useSearchParams();
  const router = useRouter();
  const token = params.get('token') ?? '';
  const reset = useResetPassword();
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = next.length > 0 && next.length < MIN_LEN;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid = useMemo(
    () => token.length > 0 && next.length >= MIN_LEN && confirm === next,
    [token, next, confirm],
  );

  async function submit() {
    setError(null);
    try {
      await reset.mutateAsync({ token, newPassword: next });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  if (!token) {
    return (
      <div className="space-y-4 text-center">
        <p className="text-sm text-[var(--danger)]">{t('noToken')}</p>
        <Link
          href="/forgot-password"
          className="text-sm font-medium text-[var(--brand)] hover:underline"
        >
          {t('requestNew')}
        </Link>
      </div>
    );
  }

  if (done) {
    return (
      <div role="status" aria-live="polite" className="space-y-4 text-center">
        <CheckCircle2 aria-hidden className="mx-auto size-8 text-[var(--success)]" />
        <p className="text-sm text-muted-foreground">{t('success')}</p>
        <Link href="/login" className="text-sm font-medium text-[var(--brand)] hover:underline">
          {t('goToLogin')}
        </Link>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void submit();
      }}
      className="space-y-4"
      noValidate
    >
      <div className="space-y-1.5">
        <Label htmlFor="rp-new">{t('new')}</Label>
        <PasswordInput
          id="rp-new"
          autoComplete="new-password"
          autoFocus
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
        {tooShort && (
          <p className="text-[11px] text-muted-foreground">{t('tooShort', { min: MIN_LEN })}</p>
        )}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="rp-confirm">{t('confirm')}</Label>
        <PasswordInput
          id="rp-confirm"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          aria-invalid={mismatch || undefined}
          className={cn(mismatch && 'border-[var(--danger)]')}
        />
        {mismatch && (
          <p role="alert" className="text-[11px] text-[var(--danger)]">
            {t('mismatch')}
          </p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-[var(--danger)]">
          {error}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={!valid || reset.isPending}>
        {reset.isPending && <Loader2 className="animate-spin" />}
        {t('submit')}
      </Button>
    </form>
  );
}

/** Aplica un token de restablecimiento (público). El token llega por query (?token=...). */
export default function ResetPasswordPage() {
  const t = useTranslations('security.reset');
  return (
    <AuthShell>
      <Card className="relative z-10 w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Loader2 className="mx-auto animate-spin" />}>
            <ResetForm />
          </Suspense>
        </CardContent>
      </Card>
    </AuthShell>
  );
}
