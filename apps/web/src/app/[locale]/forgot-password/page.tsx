'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useForgotPassword } from '@/lib/hooks';
import { isEmailish } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/lexora/theme-toggle';

/** "Olvidé mi contraseña" (público). El servidor responde siempre genérico (no revela existencia). */
export default function ForgotPasswordPage() {
  const t = useTranslations('security.forgot');
  const forgot = useForgotPassword();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);

  const valid = isEmailish(email);

  async function submit() {
    await forgot.mutateAsync(email.trim()).catch(() => undefined);
    setSent(true);
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
      <Card className="w-full max-w-sm shadow-lg">
        <CardHeader className="items-center text-center">
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div role="status" aria-live="polite" className="space-y-4 text-center">
              <CheckCircle2 aria-hidden className="mx-auto size-8 text-[var(--success)]" />
              <p className="text-sm text-muted-foreground">{t('sent')}</p>
              <Link
                href="/login"
                className="inline-block text-sm font-medium text-[var(--brand)] hover:underline"
              >
                {t('backToLogin')}
              </Link>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (valid) void submit();
              }}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-1.5">
                <Label htmlFor="email">{t('email')}</Label>
                <Input
                  id="email"
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <Button type="submit" className="w-full" disabled={!valid || forgot.isPending}>
                {forgot.isPending && <Loader2 className="animate-spin" />}
                {t('submit')}
              </Button>
              <p className="text-center text-xs">
                <Link
                  href="/login"
                  className="font-medium text-muted-foreground hover:text-[var(--brand)] hover:underline"
                >
                  {t('backToLogin')}
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
