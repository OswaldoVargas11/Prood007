'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useVerifyEmail } from '@/lib/hooks';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/lexora/theme-toggle';

function VerifyInner() {
  const t = useTranslations('verifyPage');
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const verify = useVerifyEmail();
  const [state, setState] = useState<'loading' | 'ok' | 'error'>('loading');
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) {
      setState('error');
      return;
    }
    verify
      .mutateAsync(token)
      .then(() => setState('ok'))
      .catch(() => setState('error'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === 'loading') {
    return (
      <div className="py-4 text-center">
        <Loader2 className="mx-auto size-6 animate-spin text-muted-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">{t('verifying')}</p>
      </div>
    );
  }
  if (state === 'ok') {
    return (
      <div className="space-y-4 text-center">
        <CheckCircle2 className="mx-auto size-8 text-[var(--success)]" />
        <p className="text-sm text-muted-foreground">{t('success')}</p>
        <Link href="/login" className="text-sm font-medium text-[var(--brand)] hover:underline">
          {t('goToLogin')}
        </Link>
      </div>
    );
  }
  return (
    <div className="space-y-4 text-center">
      <XCircle className="mx-auto size-8 text-[var(--danger)]" />
      <p className="text-sm text-muted-foreground">{t('error')}</p>
      <Link href="/login" className="text-sm font-medium text-[var(--brand)] hover:underline">
        {t('goToLogin')}
      </Link>
    </div>
  );
}

/** Confirma el email a partir del token (?token=...). Público. */
export default function VerifyEmailPage() {
  const t = useTranslations('verifyPage');
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
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <Suspense fallback={<Loader2 className="mx-auto animate-spin" />}>
            <VerifyInner />
          </Suspense>
        </CardContent>
      </Card>
    </main>
  );
}
