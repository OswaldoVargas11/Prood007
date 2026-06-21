'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useSocialProviders } from '@/lib/hooks';
import { useRouter, Link } from '@/i18n/navigation';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { ThemeToggle } from '@/components/lexora/theme-toggle';
import { Logo } from '@/components/lexora/logo';

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  tenantId: z.string().optional(),
});
type FormValues = z.infer<typeof schema>;

interface TenantChoice {
  tenantId: string;
  tenantName: string;
}

export default function LoginPage() {
  const t = useTranslations('login');
  const { login, mfaLogin, socialFinish } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const socialProviders = useSocialProviders();
  const [serverError, setServerError] = useState<string | null>(null);
  // Si el email existe en varios despachos con la misma contraseña, el backend devuelve la lista
  // (409 auth.chooseTenant) y mostramos un selector en vez de exigir el ID a ciegas.
  const [choices, setChoices] = useState<TenantChoice[] | null>(null);
  const [pending, setPending] = useState<FormValues | null>(null);
  // 2FA: si el usuario tiene MFA, el login devuelve un token de desafío y pedimos el código.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function doLogin(values: FormValues) {
    setServerError(null);
    try {
      const result = await login(values.email, values.password, values.tenantId);
      if (result?.mfaRequired) {
        setMfaToken(result.mfaToken);
        return;
      }
      router.replace('/dashboard');
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        const payload = err.payload as { code?: string; choices?: TenantChoice[] } | undefined;
        if (payload?.code === 'auth.chooseTenant' && payload.choices?.length) {
          setPending(values);
          setChoices(payload.choices);
          return;
        }
      }
      setServerError(err instanceof ApiError ? err.message : t('genericError'));
    }
  }

  async function submitMfa() {
    if (!mfaToken || mfaCode.trim().length < 6) return;
    setServerError(null);
    setMfaBusy(true);
    try {
      await mfaLogin(mfaToken, mfaCode.trim());
      router.replace('/dashboard');
    } catch (err) {
      setServerError(err instanceof ApiError ? err.message : t('genericError'));
    } finally {
      setMfaBusy(false);
    }
  }

  async function onSubmit(values: FormValues) {
    await doLogin(values);
  }

  async function pickTenant(tenantId: string) {
    if (!pending) return;
    await doLogin({ ...pending, tenantId });
  }

  // Vuelta del proveedor social: canjeamos el ticket (o mostramos el error) y limpiamos la URL.
  useEffect(() => {
    const ticket = params.get('social_ticket');
    const error = params.get('social_error');
    if (!ticket && !error) return;
    window.history.replaceState(null, '', window.location.pathname);
    if (error) {
      setServerError(t('socialError'));
      return;
    }
    socialFinish(ticket!)
      .then((result) => {
        if (result?.mfaRequired) setMfaToken(result.mfaToken);
        else router.replace('/dashboard');
      })
      .catch((err) => setServerError(err instanceof ApiError ? err.message : t('genericError')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden p-6">
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

      <Card className="w-full max-w-sm border-border/60 shadow-xl shadow-black/5">
        <CardHeader className="items-center space-y-3 pb-5 text-center">
          <Logo size={30} />
          <div className="space-y-1">
            <CardTitle className="text-xl tracking-tight">{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {mfaToken ? (
            <div className="space-y-4">
              <div className="space-y-1 text-center">
                <h2 className="text-base font-semibold">{t('mfaTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('mfaHint')}</p>
              </div>
              <Input
                autoFocus
                inputMode="numeric"
                placeholder="123456"
                value={mfaCode}
                onChange={(e) =>
                  setMfaCode(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 12))
                }
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void submitMfa();
                }}
                className="text-center text-lg tracking-[0.3em]"
              />
              {serverError && <p className="text-sm text-[var(--danger)]">{serverError}</p>}
              <Button
                type="button"
                className="w-full"
                onClick={() => void submitMfa()}
                disabled={mfaBusy || mfaCode.trim().length < 6}
              >
                {mfaBusy ? <Loader2 className="size-4 animate-spin" /> : null}
                {t('mfaVerify')}
              </Button>
              <button
                type="button"
                onClick={() => {
                  setMfaToken(null);
                  setMfaCode('');
                  setServerError(null);
                }}
                className="block w-full text-center text-xs text-muted-foreground hover:text-foreground"
              >
                {t('mfaBack')}
              </button>
            </div>
          ) : choices ? (
            <div className="space-y-4">
              <div className="space-y-1 text-center">
                <h2 className="text-base font-semibold">{t('chooseTenantTitle')}</h2>
                <p className="text-sm text-muted-foreground">{t('chooseTenantHint')}</p>
              </div>
              <div className="space-y-2">
                {choices.map((c) => (
                  <button
                    key={c.tenantId}
                    type="button"
                    onClick={() => void pickTenant(c.tenantId)}
                    disabled={isSubmitting}
                    className="flex w-full items-center justify-between rounded-lg border bg-card px-4 py-3 text-left text-sm font-medium transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] disabled:opacity-60"
                  >
                    {c.tenantName}
                    {isSubmitting && <Loader2 className="size-4 animate-spin" />}
                  </button>
                ))}
              </div>
              {serverError && (
                <p role="alert" className="text-sm text-[var(--danger)]">
                  {serverError}
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  setChoices(null);
                  setPending(null);
                  setServerError(null);
                }}
                className="w-full text-center text-xs font-medium text-muted-foreground hover:text-[var(--brand)] hover:underline"
              >
                {t('chooseTenantBack')}
              </button>
            </div>
          ) : (
            <>
              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
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
                    {...register('email')}
                  />
                  {errors.email && (
                    <p className="text-xs text-[var(--danger)]">{t('invalidEmail')}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="password">{t('password')}</Label>
                  <PasswordInput
                    id="password"
                    autoComplete="current-password"
                    {...register('password')}
                  />
                  {errors.password && (
                    <p className="text-xs text-[var(--danger)]">{t('required')}</p>
                  )}
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

              {(socialProviders.data?.google || socialProviders.data?.microsoft) && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    {t('orContinue')}
                    <span className="h-px flex-1 bg-border" />
                  </div>
                  {socialProviders.data?.google && (
                    <SocialButton provider="google" label={t('withGoogle')} />
                  )}
                  {socialProviders.data?.microsoft && (
                    <SocialButton provider="microsoft" label={t('withMicrosoft')} />
                  )}
                </div>
              )}

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
                <Link
                  href="/onboarding"
                  className="font-medium text-[var(--brand)] hover:underline"
                >
                  {t('createFirm')}
                </Link>
              </p>
            </>
          )}
        </CardContent>
      </Card>
      <p className="mt-6 text-center text-[11.5px] text-muted-foreground">
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          Privacidad
        </Link>
        <span className="mx-2">·</span>
        <Link href="/terms" className="hover:text-foreground hover:underline">
          Términos del servicio
        </Link>
      </p>
    </main>
  );
}

/** Botón de login social: navega (página completa) al inicio del flujo OAuth en la API. */
function SocialButton({ provider, label }: { provider: 'google' | 'microsoft'; label: string }) {
  const href = `${process.env.NEXT_PUBLIC_API_URL ?? ''}/api/auth/social/${provider}`;
  return (
    <a
      href={href}
      className="flex h-10 w-full items-center justify-center gap-2.5 rounded-lg border bg-card text-sm font-medium text-foreground shadow-sm transition hover:bg-accent hover:shadow"
    >
      {provider === 'google' ? <GoogleIcon /> : <MicrosoftIcon />}
      {label}
    </a>
  );
}

/** Logos de marca (colores oficiales, intencionadamente fijos). */
function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"
      />
      <path
        fill="#FF3D00"
        d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
      />
      <path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z"
      />
      <path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z"
      />
    </svg>
  );
}
function MicrosoftIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden>
      <path fill="#F35325" d="M1 1h10v10H1z" />
      <path fill="#81BC06" d="M12 1h10v10H12z" />
      <path fill="#05A6F0" d="M1 12h10v10H1z" />
      <path fill="#FFBA08" d="M12 12h10v10H12z" />
    </svg>
  );
}
