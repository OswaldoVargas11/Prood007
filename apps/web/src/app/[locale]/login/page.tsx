'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useRouter, Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/lexora/theme-toggle';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

export default function LoginPage() {
  const t = useTranslations('login');
  const { login } = useAuth();
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setServerError(null);
    try {
      await login(values.email, values.password, values.tenantId);
      router.replace('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden p-6">
      {/* fondo con gradiente sutil del brand */}
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
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--ai-from)] to-[var(--ai-to)]">
            <div className="size-3.5 rotate-45 rounded border-2 border-white" />
          </div>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
            <div className="space-y-1.5">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                {...register('email')}
              />
              {errors.email && <p className="text-xs text-[var(--danger)]">{t('invalidEmail')}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">{t('password')}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                {...register('password')}
              />
              {errors.password && <p className="text-xs text-[var(--danger)]">{t('required')}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tenantId" className="text-muted-foreground">
                {t('tenantOptional')}
              </Label>
              <Input id="tenantId" autoComplete="off" {...register('tenantId')} />
            </div>
            {serverError && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {serverError}
              </p>
            )}
            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isSubmitting ? t('signingIn') : t('signIn')}
            </Button>
          </form>
          <p className="mt-3 text-center text-xs">
            <Link
              href="/forgot-password"
              className="font-medium text-muted-foreground hover:text-[var(--brand)] hover:underline"
            >
              {t('forgotPassword')}
            </Link>
          </p>
          <p className="mt-4 text-center text-xs text-muted-foreground">
            {t('noAccount')}{' '}
            <Link href="/onboarding" className="font-medium text-[var(--brand)] hover:underline">
              {t('createFirm')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </main>
  );
}
