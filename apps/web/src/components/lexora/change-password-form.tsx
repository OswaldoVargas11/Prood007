'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useChangePassword } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

const MIN_LEN = 10;

/** Fuerza orientativa (no es la política del servidor): longitud + variedad de clases de carácter. */
function strengthOf(pw: string): 0 | 1 | 2 | 3 | 4 {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= MIN_LEN) score++;
  if (pw.length >= 14) score++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
}

/**
 * Formulario de cambio de contraseña self-service, reutilizable por staff (Ajustes) y cliente
 * (Portal). Cierra el resto de sesiones en el servidor y mantiene viva la sesión actual.
 */
export function ChangePasswordForm() {
  const t = useTranslations('security');
  const change = useChangePassword();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const strength = useMemo(() => strengthOf(next), [next]);
  const tooShort = next.length > 0 && next.length < MIN_LEN;
  const mismatch = confirm.length > 0 && confirm !== next;
  const valid =
    current.length > 0 && next.length >= MIN_LEN && confirm === next && next !== current;

  async function submit() {
    setError(null);
    setDone(false);
    try {
      await change.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  const strengthLabels = [
    t('strength.0'),
    t('strength.1'),
    t('strength.2'),
    t('strength.3'),
    t('strength.4'),
  ];
  const strengthColors = [
    'var(--danger)',
    'var(--danger)',
    'var(--warning)',
    'var(--brand)',
    'var(--success)',
  ];

  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="cp-current">{t('current')}</Label>
        <PasswordInput
          id="cp-current"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoComplete="current-password"
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-new">{t('new')}</Label>
        <PasswordInput
          id="cp-new"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          autoComplete="new-password"
        />
        {next.length > 0 && (
          <div className="space-y-1">
            <div className="flex gap-1">
              {[0, 1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-1 flex-1 rounded-full bg-accent"
                  style={i < strength ? { background: strengthColors[strength] } : undefined}
                />
              ))}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {tooShort ? t('tooShort', { min: MIN_LEN }) : strengthLabels[strength]}
            </p>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="cp-confirm">{t('confirm')}</Label>
        <PasswordInput
          id="cp-confirm"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          autoComplete="new-password"
          className={cn(mismatch && 'border-[var(--danger)]')}
        />
        {mismatch && <p className="text-[11px] text-[var(--danger)]">{t('mismatch')}</p>}
      </div>

      {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
      {done && (
        <p className="flex items-center gap-1.5 text-sm text-[var(--success)]">
          <CheckCircle2 className="size-4" /> {t('success')}
        </p>
      )}

      <div className="flex justify-end">
        <Button size="sm" onClick={submit} disabled={!valid || change.isPending}>
          {change.isPending && <Loader2 className="animate-spin" />}
          {t('submit')}
        </Button>
      </div>
    </div>
  );
}
