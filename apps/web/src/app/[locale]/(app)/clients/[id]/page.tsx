'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import {
  AlertTriangle,
  Check,
  Download,
  KeyRound,
  Loader2,
  Mail,
  MapPin,
  Phone,
  ShieldOff,
} from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  downloadGdprExport,
  useAnonymizeClient,
  useClient,
  useClientRetainer,
  useCreatePortalUser,
  useMatters,
} from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { StatusBadge } from '@/components/lexora/status-badge';
import { AdminResetPasswordButton } from '@/components/lexora/admin-reset-password';
import { KycCard } from '@/components/lexora/kyc-card';
import { CompanySecretaryTab } from '@/components/lexora/company-secretary-tab';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { isEmailish } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { Client } from '@/lib/types';

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

export default function ClientProfilePage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('clients');
  const tm = useTranslations('matters');
  const { data: client, isLoading } = useClient(id);
  const matters = useMatters({ clientId: id, pageSize: 100 });
  const retainer = useClientRetainer(id);
  const tr = useTranslations('retainer');
  const locale = useLocale();
  const [granting, setGranting] = useState(false);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-5xl space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!client) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        {t('loadError')}
        <div className="mt-2">
          <Link href="/clients" className="text-[var(--brand)] hover:underline">
            ← {t('title')}
          </Link>
        </div>
      </div>
    );
  }

  const contact = [
    client.email && { icon: Mail, value: client.email },
    client.phone && { icon: Phone, value: client.phone },
    client.address && { icon: MapPin, value: client.address },
  ].filter(Boolean) as { icon: typeof Mail; value: string }[];

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link href="/clients" className="text-sm text-muted-foreground hover:text-foreground">
        ← {t('title')}
      </Link>

      <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
        {/* Columna izquierda: resumen + RGPD (solo admin). */}
        <div className="h-fit space-y-4 lg:sticky lg:top-20">
          {/* Resumen */}
          <Card>
            <CardContent className="space-y-4 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-12 items-center justify-center rounded-xl bg-[var(--brand)] text-base font-semibold text-white">
                  {initials(client.name)}
                </span>
                <div className="min-w-0">
                  <div className="font-semibold leading-tight">{client.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {client.taxIdKind ?? t('client')}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-md border border-border bg-[var(--surface-2)] px-3 py-2">
                <span className="font-mono text-xs text-muted-foreground">{client.taxId}</span>
                {client.taxIdKind && (
                  <Badge variant="success" className="ml-auto gap-1 py-0">
                    <Check className="size-3" />
                    {t('validated')}
                  </Badge>
                )}
              </div>

              {contact.length > 0 && (
                <div className="space-y-2">
                  {contact.map((c, i) => {
                    const Icon = c.icon;
                    return (
                      <div
                        key={i}
                        className="flex items-center gap-2.5 text-sm text-muted-foreground"
                      >
                        <Icon className="size-3.5 shrink-0" />
                        <span className="truncate">{c.value}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              <div
                className="rounded-lg border p-3"
                style={{
                  background: client.userId ? 'var(--success-soft)' : 'var(--surface-2)',
                  borderColor: client.userId ? 'var(--success)' : 'var(--border)',
                }}
              >
                <div
                  className="flex items-center gap-2 text-xs font-semibold"
                  style={{ color: client.userId ? 'var(--success)' : 'var(--text-subtle)' }}
                >
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: client.userId ? 'var(--success)' : 'var(--text-subtle)' }}
                  />
                  {client.userId ? t('portalActive') : t('portalInactive')}
                </div>
                {!client.userId && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-3 w-full"
                    onClick={() => setGranting(true)}
                  >
                    <KeyRound /> {t('grantPortal')}
                  </Button>
                )}
                {client.userId && (
                  <AdminResetPasswordButton
                    userId={client.userId}
                    variant="outline"
                    className="mt-3 w-full"
                    label={t('resetPortalPassword')}
                  />
                )}
              </div>

              {/* Saldo de provisión agregado (Σ de los expedientes del cliente). */}
              {retainer.data && Number(retainer.data.total) > 0 && (
                <div className="flex items-center justify-between rounded-md border border-border bg-[var(--surface-2)] px-3 py-2">
                  <span className="text-xs uppercase tracking-wide text-muted-foreground">
                    {tr('clientBalance')}
                  </span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--success)]">
                    {formatMoney(retainer.data.total, retainer.data.currency ?? 'EUR', locale)}
                  </span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* RGPD: exportar / anonimizar — solo FIRM_ADMIN (el backend también lo restringe). */}
          <GdprCard client={client} />

          {/* KYC/AML: diligencia debida del cliente (prevención de blanqueo). */}
          <KycCard clientId={client.id} />
        </div>
        <GrantPortalDialog client={client} open={granting} onClose={() => setGranting(false)} />

        {/* Tabs */}
        <Tabs defaultValue="matters">
          <TabsList className="w-full overflow-x-auto">
            <TabsTrigger value="matters">{tm('title')}</TabsTrigger>
            <TabsTrigger value="documents">{t('tabDocuments')}</TabsTrigger>
            <TabsTrigger value="invoices">{t('tabInvoices')}</TabsTrigger>
            <TabsTrigger value="secretary">{t('tabSecretary')}</TabsTrigger>
          </TabsList>

          <TabsContent value="matters">
            {matters.isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : matters.data?.items.length === 0 ? (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {tm('empty')}
                </CardContent>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="divide-y divide-border">
                  {matters.data?.items.map((m) => (
                    <Link
                      key={m.id}
                      href={`/matters/${m.id}`}
                      className="flex items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-accent"
                    >
                      <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                        {m.reference}
                      </span>
                      <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                      <StatusBadge status={m.status} />
                    </Link>
                  ))}
                </div>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="documents">
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('docsHint')}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="invoices">
            <Card>
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                {t('invoicesHint')}
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="secretary">
            <CompanySecretaryTab clientId={id} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function GrantPortalDialog({
  client,
  open,
  onClose,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('clients');
  const grant = useCreatePortalUser(client.id);
  const [email, setEmail] = useState(client.email ?? '');
  const [fullName, setFullName] = useState(client.name);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const emailValid = isEmailish(email);
  const valid = emailValid && fullName.trim().length >= 2 && password.length >= 10;

  async function submit() {
    setError(null);
    try {
      await grant.mutateAsync({ email: email.trim(), fullName: fullName.trim(), password });
      setPassword('');
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('portalError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('grantPortalTitle')}</DialogTitle>
          <DialogDescription>{t('grantPortalDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('portalName')}</Label>
            <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('email')}</Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{t('portalPassword')}</Label>
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
            <p className="text-[11px] text-[var(--text-subtle)]">{t('portalPasswordHint')}</p>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid || grant.isPending}>
            {grant.isPending && <Loader2 className="animate-spin" />}
            {t('grantPortalConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tarjeta RGPD/Ley 172-13 (solo FIRM_ADMIN): exportar los datos del titular (portabilidad) y
 * anonimizar (supresión irreversible). Si el cliente ya está anonimizado, muestra su estado.
 */
function GdprCard({ client }: { client: Client }) {
  const t = useTranslations('clients.gdpr');
  const locale = useLocale();
  const { hasRole } = useAuth();
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(false);
  const [confirming, setConfirming] = useState(false);

  // El backend también restringe a FIRM_ADMIN; aquí evitamos mostrar la superficie a otros roles.
  if (!hasRole('FIRM_ADMIN')) return null;

  if (client.anonymizedAt) {
    return (
      <Card>
        <CardContent className="space-y-2 p-5">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <ShieldOff className="size-4 text-[var(--text-subtle)]" />
            {t('anonymized')}
          </div>
          <p className="text-xs text-muted-foreground">
            {t('anonymizedOn', { date: formatDate(client.anonymizedAt, locale) })}
          </p>
          <p className="text-xs text-muted-foreground">{t('anonymizedNote')}</p>
        </CardContent>
      </Card>
    );
  }

  async function exportData() {
    setExportError(false);
    setExporting(true);
    try {
      const slug = (client.taxId || client.name || client.id).replace(/[^\w.-]+/g, '_');
      await downloadGdprExport(client.id, `rgpd-${slug}.json`);
    } catch {
      setExportError(true);
    } finally {
      setExporting(false);
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div>
          <div className="text-sm font-semibold">{t('title')}</div>
          <p className="mt-1 text-xs text-muted-foreground">{t('desc')}</p>
        </div>

        <div className="space-y-2">
          <Button
            size="sm"
            variant="outline"
            className="w-full"
            onClick={exportData}
            disabled={exporting}
          >
            {exporting ? <Loader2 className="animate-spin" /> : <Download />}
            {exporting ? t('exporting') : t('export')}
          </Button>
          <p className="text-[11px] text-[var(--text-subtle)]">{t('exportHint')}</p>
          {exportError && <p className="text-xs text-[var(--danger)]">{t('exportError')}</p>}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <Button
            size="sm"
            variant="outline"
            className="w-full border-[var(--danger)] text-[var(--danger)] hover:bg-[var(--danger-soft)]"
            onClick={() => setConfirming(true)}
          >
            <ShieldOff /> {t('anonymize')}
          </Button>
          <p className="text-[11px] text-[var(--text-subtle)]">{t('anonymizeHint')}</p>
        </div>
      </CardContent>

      <AnonymizeDialog client={client} open={confirming} onClose={() => setConfirming(false)} />
    </Card>
  );
}

/**
 * Confirmación fuerte de anonimización: irreversible, exige escribir el nombre exacto del cliente.
 * Deja explícito que la PII se borra y el portal se corta, pero expediente y facturas se conservan.
 */
function AnonymizeDialog({
  client,
  open,
  onClose,
}: {
  client: Client;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('clients.gdpr');
  const tc = useTranslations('clients');
  const anonymize = useAnonymizeClient(client.id);
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string | null>(null);

  const matches = typed.trim() === client.name.trim();

  function close() {
    setTyped('');
    setError(null);
    onClose();
  }

  async function submit() {
    if (!matches) return;
    setError(null);
    try {
      await anonymize.mutateAsync();
      close();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('anonymizeError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-[var(--danger)]" />
            {t('anonymizeTitle', { name: client.name })}
          </DialogTitle>
          <DialogDescription>{t('anonymizeWarning')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="anon-confirm">{t('anonymizeConfirmLabel')}</Label>
          <p className="font-mono text-sm font-medium">{client.name}</p>
          <Input
            id="anon-confirm"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoComplete="off"
            autoFocus
          />
          {typed.trim().length > 0 && !matches && (
            <p className="text-xs text-[var(--danger)]">{t('anonymizeMismatch')}</p>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={close}>
            {tc('cancel')}
          </Button>
          <Button
            size="sm"
            className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]/90"
            onClick={submit}
            disabled={!matches || anonymize.isPending}
          >
            {anonymize.isPending && <Loader2 className="animate-spin" />}
            {t('anonymizeConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
