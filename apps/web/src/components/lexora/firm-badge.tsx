'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Building2, Check, Copy } from 'lucide-react';
import { useAuth } from '@/lib/auth';

/**
 * Chip del despacho en el header: muestra el NOMBRE del despacho y permite COPIAR su ID, que el
 * usuario puede facilitar a soporte si necesita ayuda para iniciar sesión (login multi-despacho).
 */
export function FirmBadge() {
  const t = useTranslations('firm');
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);

  const tenant = user?.tenant;
  if (!tenant?.name) return null;

  async function copyId() {
    if (!tenant) return;
    await navigator.clipboard.writeText(tenant.id).catch(() => undefined);
    setCopied(true);
    toast(t('idCopied'), { description: tenant.id });
    setTimeout(() => setCopied(false), 1500);
  }

  return (
    <button
      type="button"
      onClick={() => void copyId()}
      title={`${t('copyId')} · ${tenant.id}`}
      aria-label={`${tenant.name} — ${t('copyId')}`}
      className="hidden min-w-0 items-center gap-2 rounded-lg border border-border bg-card/60 px-2.5 py-1.5 text-sm transition hover:border-[var(--brand)] hover:bg-[var(--brand-soft)] sm:inline-flex"
    >
      <Building2 className="size-4 shrink-0 text-muted-foreground" />
      <span className="max-w-[12rem] truncate font-medium">{tenant.name}</span>
      {copied ? (
        <Check className="size-3.5 shrink-0 text-[var(--success)]" />
      ) : (
        <Copy className="size-3.5 shrink-0 text-muted-foreground" />
      )}
    </button>
  );
}
