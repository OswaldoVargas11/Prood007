'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { BadgeCheck, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useApprovals, useResolveCost } from '@/lib/hooks';
import { toastMsg } from '@/lib/toasts';
import { formatMoney, formatDateTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';

export default function ApprovalsPage() {
  const t = useTranslations('approvals');
  const locale = useLocale();
  const { hasRole } = useAuth();
  const { data, isLoading, isError } = useApprovals();
  const resolve = useResolveCost();
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!hasRole('FIRM_ADMIN')) {
    return (
      <div className="mx-auto max-w-2xl py-16 text-center text-sm text-muted-foreground">
        {t('notAuthorized')}
      </div>
    );
  }

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    try {
      await resolve.mutateAsync({ id, action });
      toast.success(action === 'approve' ? toastMsg.costApproved : toastMsg.costRejected);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-[820px] space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
      </div>

      {isLoading && <Skeleton className="h-48 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {data && data.length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center">
          <BadgeCheck className="mx-auto size-7 text-[var(--success)]" />
          <p className="mt-3 text-sm text-muted-foreground">{t('empty')}</p>
        </div>
      )}

      {data && data.length > 0 && (
        <div className="space-y-3">
          {data.map((a) => (
            <div key={a.id} className="rounded-xl border bg-card p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[11px] text-[var(--text-subtle)]">
                      {a.matter.reference}
                    </span>
                    <span className="truncate text-[13px] font-medium">{a.matter.title}</span>
                  </div>
                  <div className="mt-1 text-[13px]">{a.description}</div>
                  <div className="mt-1 text-[11.5px] text-[var(--text-subtle)]">
                    {t('proposedBy', { name: a.proposedBy })} ·{' '}
                    {formatDateTime(a.createdAt, locale)}
                  </div>
                  {a.note && (
                    <div className="mt-1 text-[12px] italic text-muted-foreground">“{a.note}”</div>
                  )}
                </div>
                <div className="text-right">
                  <div className="text-[18px] font-semibold tabular-nums">
                    {formatMoney(a.amount, a.currency, locale)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busyId === a.id}
                  onClick={() => act(a.id, 'reject')}
                  className="border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
                >
                  {busyId === a.id && resolve.variables?.action === 'reject' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <X />
                  )}
                  {t('reject')}
                </Button>
                <Button
                  size="sm"
                  disabled={busyId === a.id}
                  onClick={() => act(a.id, 'approve')}
                  className="bg-[var(--success)] hover:opacity-90"
                >
                  {busyId === a.id && resolve.variables?.action === 'approve' ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Check />
                  )}
                  {t('approve')}
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
