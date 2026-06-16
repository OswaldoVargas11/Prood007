'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, KeyRound, Loader2 } from 'lucide-react';
import { useAdminResetPassword, type AdminResetResult } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/**
 * Botón de "Restablecer contraseña" para FIRM_ADMIN. Genera un enlace de un solo uso (sin email) que
 * el admin entrega al usuario (staff o cliente de portal). El enlace se muestra UNA vez.
 */
export function AdminResetPasswordButton({
  userId,
  size = 'sm',
  variant = 'outline',
  className,
  label,
}: {
  userId: string;
  size?: 'sm' | 'default';
  variant?: 'outline' | 'ghost';
  className?: string;
  label?: string;
}) {
  const t = useTranslations('security.adminReset');
  const reset = useAdminResetPassword();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<AdminResetResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function generate() {
    setError(null);
    setResult(null);
    setOpen(true);
    try {
      setResult(await reset.mutateAsync(userId));
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  async function copy() {
    if (!result) return;
    await navigator.clipboard.writeText(result.resetLink).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <>
      <Button
        size={size}
        variant={variant}
        className={className}
        onClick={generate}
        disabled={reset.isPending}
      >
        {reset.isPending ? <Loader2 className="animate-spin" /> : <KeyRound />}
        {label ?? t('action')}
      </Button>
      <Dialog open={open} onOpenChange={(o) => !o && setOpen(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('title')}</DialogTitle>
            <DialogDescription>{t('desc')}</DialogDescription>
          </DialogHeader>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          {reset.isPending && !result && (
            <p className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> {t('generating')}
            </p>
          )}
          {result && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-md border bg-[var(--surface-1)] px-3 py-2 text-[12px]">
                  {result.resetLink}
                </code>
                <Button size="sm" variant="outline" onClick={copy} aria-label={t('copy')}>
                  {copied ? <Check className="text-[var(--success)]" /> : <Copy />}
                </Button>
              </div>
              <p className="text-[11.5px] text-muted-foreground">{t('oneTimeHint')}</p>
            </div>
          )}
          <DialogFooter>
            <Button size="sm" onClick={() => setOpen(false)}>
              {t('close')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
