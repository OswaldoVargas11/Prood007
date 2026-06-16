'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, CreditCard, Download, Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import {
  downloadInvoicePdf,
  usePortalCheckout,
  usePortalInvoices,
  usePortalMatters,
  usePortalPaymentConfig,
} from '@/lib/hooks';
import { jurisdictionCopy } from '@/lib/jurisdiction';
import { invoiceStatusVariant } from '@/lib/ledger';
import { formatDate, formatMoney } from '@/lib/format';
import { StatusBadge } from '@/components/lexora/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export default function PortalHome() {
  const t = useTranslations('portal');
  const tInv = useTranslations('billing');
  const locale = useLocale();
  const { user } = useAuth();
  const matters = usePortalMatters();
  const invoices = usePortalInvoices();
  const payConfig = usePortalPaymentConfig();
  const copy = user ? jurisdictionCopy(user.jurisdiction) : null;
  const overdueCount = (invoices.data ?? []).filter((inv) => inv.overdue).length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('welcome')}</h1>
        {copy && <p className="mt-1 text-sm text-muted-foreground">{copy.country}</p>}
      </div>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('myMatters')}</h2>
        {matters.isLoading && <Skeleton className="h-28 w-full" />}
        {matters.isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}
        {matters.data?.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('noMatters')}
            </CardContent>
          </Card>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {matters.data?.map((m) => (
            <Link key={m.id} href={`/portal/matters/${m.id}`}>
              <Card className="transition-colors hover:border-[var(--brand-line)]">
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
                    <StatusBadge status={m.status} />
                  </div>
                  <div className="font-medium">{m.title}</div>
                  <div className="text-xs text-muted-foreground">{m.type}</div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('myInvoices')}</h2>
        {overdueCount > 0 && (
          <div className="flex items-start gap-3 rounded-xl border border-[var(--danger)]/20 bg-[var(--danger-soft)] p-4">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" />
            <div className="space-y-0.5">
              <p className="text-sm font-medium text-[var(--danger)]">
                {t('overdueBanner', { n: overdueCount })}
              </p>
              <p className="text-[13px] text-muted-foreground">{t('overdueHint')}</p>
            </div>
          </div>
        )}
        {invoices.isLoading && <Skeleton className="h-24 w-full" />}
        {invoices.isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}
        {invoices.data?.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('noInvoices')}
            </CardContent>
          </Card>
        )}
        {invoices.data && invoices.data.length > 0 && (
          <Card className="overflow-hidden">
            <table className="w-full text-sm">
              <tbody>
                {invoices.data.map((inv) => {
                  const displayStatus = inv.overdue ? 'OVERDUE' : inv.status;
                  return (
                    <tr key={inv.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-mono text-xs">{inv.number}</td>
                      <td className="px-4 py-3">
                        <Badge variant={invoiceStatusVariant(displayStatus)}>
                          {tInv(`invoiceStatus.${displayStatus}`)}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 tabular-nums text-muted-foreground">
                        {formatDate(inv.issueDate, locale)}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {formatMoney(inv.total, inv.currency, locale)}
                      </td>
                      <td className="px-2 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {payConfig.data?.onlineEnabled &&
                            inv.status !== 'PAID' &&
                            inv.status !== 'CANCELLED' && (
                              <PayOnlineButton invoiceId={inv.id} label={tInv('payOnline')} />
                            )}
                          <InvoicePdfButton
                            path={`/portal/invoices/${inv.id}/pdf`}
                            filename={`Factura-${inv.number}.pdf`}
                            label={t('downloadInvoice')}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        )}
      </section>
    </div>
  );
}

/** Botón "Pagar online": el cliente paga su factura por Stripe Checkout (redirección). */
function PayOnlineButton({ invoiceId, label }: { invoiceId: string; label: string }) {
  const checkout = usePortalCheckout(invoiceId);
  return (
    <Button
      size="sm"
      onClick={() =>
        checkout.mutate(undefined, {
          onSuccess: ({ url }) => {
            window.location.href = url;
          },
        })
      }
      disabled={checkout.isPending}
    >
      {checkout.isPending ? (
        <Loader2 className="size-4 animate-spin" />
      ) : (
        <CreditCard className="size-4" />
      )}
      {label}
    </Button>
  );
}

/** Botón de descarga del PDF de una factura, con estado de carga. */
function InvoicePdfButton({
  path,
  filename,
  label,
}: {
  path: string;
  filename: string;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  async function go() {
    setLoading(true);
    try {
      await downloadInvoicePdf(path, filename);
    } finally {
      setLoading(false);
    }
  }
  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={go}
      disabled={loading}
      aria-label={label}
      title={label}
    >
      {loading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
    </Button>
  );
}
