'use client';

import { useTranslations } from 'next-intl';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { ChangePasswordForm } from './change-password-form';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from './theme-toggle';

/**
 * Pantalla bloqueante: cuando el backend marca `mustChangePassword` (cuenta creada por el admin o
 * tras un reset), el usuario DEBE fijar una contraseña propia antes de operar. Al cambiarla, el
 * backend limpia el flag; recargamos el usuario (`refreshUser`) para liberar el acceso.
 */
export function ForcePasswordChange() {
  const t = useTranslations('security.force');
  const { user, refreshUser } = useAuth();

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
          <div className="mb-2 flex size-10 items-center justify-center rounded-xl bg-[var(--warning-soft)]">
            <ShieldAlert className="size-5 text-[var(--warning)]" />
          </div>
          <CardTitle className="text-xl">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
          {user?.email && <p className="text-[12px] text-muted-foreground">{user.email}</p>}
        </CardHeader>
        <CardContent>
          {/* `current` = la contraseña temporal que le facilitó el despacho. */}
          <ChangePasswordForm onSuccess={() => void refreshUser()} />
        </CardContent>
      </Card>
    </main>
  );
}
