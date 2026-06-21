'use client';

import { useTranslations } from 'next-intl';
import { Loader2, RefreshCw, Send } from 'lucide-react';
import { useRefreshEcf, useTransmitEcf } from '@/lib/hooks';
import { ecfStatusVariant } from '@/lib/ledger';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Invoice } from '@/lib/types';

/**
 * Estado de la transmisión del e-CF a la DGII + acciones (transmitir / consultar acuse). Solo para
 * facturas de formato ECF. Si la transmisión está apagada o sin certificado, el backend deja STUBBED.
 */
export function EcfStatusPanel({ invoice }: { invoice: Invoice }) {
  const t = useTranslations('billing.ecf');
  const transmit = useTransmitEcf(invoice.id);
  const refresh = useRefreshEcf(invoice.id);
  const status = invoice.ecfStatus ?? 'STUBBED';

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
      {invoice.ecfStatusDetail && (
        <p className="text-[12px] text-muted-foreground">{invoice.ecfStatusDetail}</p>
      )}
    </div>
  );
}
