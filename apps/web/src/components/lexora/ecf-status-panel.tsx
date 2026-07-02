'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { AlertTriangle, FilePlus2, Loader2, RefreshCw, Send } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import { useRectifyInvoice, useRefreshEcf, useTransmitEcf } from '@/lib/hooks';
import { ecfStatusVariant } from '@/lib/ledger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import type { Invoice } from '@/lib/types';

/**
 * Estado de la transmisión del e-CF a la DGII + acciones (transmitir / consultar acuse). Solo para
 * facturas de formato ECF. Si la transmisión está apagada o sin certificado, el backend deja STUBBED.
 * Un RECHAZO de la DGII se muestra en destacado con su motivo (`ecfStatusDetail`) y ofrece la
 * corrección por el flujo de rectificativas (nota de crédito tipo 34); la original es inmutable.
 */
export function EcfStatusPanel({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('billing.ecf');
  const router = useRouter();
  const transmit = useTransmitEcf(invoice.id);
  const refresh = useRefreshEcf(invoice.id);
  const rectify = useRectifyInvoice(invoice.id);
  const [rectifyOpen, setRectifyOpen] = useState(false);
  const [reason, setReason] = useState('');
  const status = invoice.ecfStatus ?? 'STUBBED';
  const rejected = status === 'REJECTED';

  function submitRectify() {
    rectify.mutate(reason.trim(), {
      onSuccess: (data) => {
        setRectifyOpen(false);
        router.push(`/invoices/${data.invoice.id}`);
      },
    });
  }

  return (
    <div className="space-y-2 rounded-lg border border-border bg-[var(--surface-2)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-muted-foreground">{t('status')}</span>
        <Badge variant={ecfStatusVariant(status)}>{t(`statuses.${status}`)}</Badge>
        <div className="ml-auto flex gap-1.5">
          <Button
            size="sm"
            variant="outline"
            onClick={() => transmit.mutate()}
            disabled={transmit.isPending}
          >
            {transmit.isPending ? <Loader2 className="animate-spin" /> : <Send />}
            {t('transmit')}
          </Button>
          {invoice.ecfTrackId && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => refresh.mutate()}
              disabled={refresh.isPending}
            >
              {refresh.isPending ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {t('refresh')}
            </Button>
          )}
        </div>
      </div>
      {invoice.ecfTrackId && (
        <div className="text-[11px] text-muted-foreground">
          TrackId: <span className="font-mono">{invoice.ecfTrackId}</span>
        </div>
      )}
      {rejected ? (
        <div className="space-y-2 rounded-md border border-[var(--danger)]/40 bg-[var(--danger)]/5 p-3">
          <div className="flex items-center gap-2 text-[12px] font-medium text-[var(--danger)]">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {t('rejectedTitle')}
          </div>
          {invoice.ecfStatusDetail && (
            <p className="text-[12px] text-muted-foreground">{invoice.ecfStatusDetail}</p>
          )}
          <p className="text-[12px] text-muted-foreground">{t('rejectedHint')}</p>
          <Dialog open={rectifyOpen} onOpenChange={setRectifyOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" disabled={rectify.isPending}>
                <FilePlus2 />
                {t('rectify')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>{t('rectifyTitle')}</DialogTitle>
                <DialogDescription>
                  {t('rectifyBody', { number: invoice.number })}
                </DialogDescription>
              </DialogHeader>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t('rectifyReasonPlaceholder')}
                rows={3}
                maxLength={500}
              />
              <DialogFooter>
                <Button variant="outline" size="sm" onClick={() => setRectifyOpen(false)}>
                  {t('rectifyCancel')}
                </Button>
                <Button
                  size="sm"
                  onClick={submitRectify}
                  disabled={rectify.isPending || reason.trim().length < 3}
                >
                  {rectify.isPending && <Loader2 className="animate-spin" />}
                  {t('rectifyConfirm')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      ) : (
        invoice.ecfStatusDetail && (
          <p className="text-[12px] text-muted-foreground">{invoice.ecfStatusDetail}</p>
        )
      )}
    </div>
  );
}
