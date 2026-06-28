'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { AlertTriangle, Building2, Check, Loader2, Plus, Search, User, Users } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useClients, useConflictCheck, useCreateClient } from '@/lib/hooks';
import { formatMoney } from '@/lib/format';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

function initials(name: string): string {
  return name
    .split(' ')
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();
}

/** Tipo de cliente derivado del tipo de identificador fiscal (sin acoplar al país). */
function clientType(kind: string | null): 'company' | 'individual' | null {
  if (!kind) return null;
  if (kind === 'OTHER') return null; // documento genérico: no inferimos empresa/persona
  return kind === 'CIF' || kind === 'RNC' ? 'company' : 'individual';
}

export default function ClientsPage() {
  const t = useTranslations('clients');
  const locale = useLocale();
  const { data, isLoading, isError, refetch } = useClients();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const currency = data?.currency ?? 'EUR';

  const items = data?.items ?? [];
  const q = query.trim().toLowerCase();
  const filtered = q
    ? items.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.taxId ?? '').toLowerCase().includes(q),
      )
    : items;

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={
          data
            ? `${data.items.length} ${data.items.length === 1 ? 'cliente' : 'clientes'}`
            : undefined
        }
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> {t('new')}
          </Button>
        }
      />
      <CreateClientDialog open={creating} onClose={() => setCreating(false)} />

      {items.length > 0 && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t('searchPlaceholder')}
            aria-label={t('searchPlaceholder')}
            className="pl-9"
          />
        </div>
      )}

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th scope="col" className="px-4 py-3 font-medium">
                {t('name')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('fiscalId')}
              </th>
              <th scope="col" className="px-4 py-3 font-medium">
                {t('type')}
              </th>
              <th scope="col" className="px-4 py-3 text-center font-medium">
                {t('matters')}
              </th>
              <th scope="col" className="px-4 py-3 text-right font-medium">
                {t('balance')}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={5} className="px-4 py-3">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))}
            {!isLoading && !isError && items.length > 0 && filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                  {t('noResults', { q: query.trim() })}
                </td>
              </tr>
            )}
            {!isLoading &&
              !isError &&
              filtered.map((c) => (
                <tr
                  key={c.id}
                  className="border-b border-border transition-colors last:border-0 hover:bg-accent"
                >
                  <td className="px-4 py-3">
                    <Link href={`/clients/${c.id}`} className="flex items-center gap-2.5">
                      <span className="flex size-7 items-center justify-center rounded-lg bg-[var(--brand-soft)] text-[10px] font-semibold text-[var(--brand)]">
                        {initials(c.name)}
                      </span>
                      <span className="font-medium hover:underline">{c.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{c.taxId}</span>
                      {c.taxIdKind && (
                        <Badge variant="success" className="gap-1 py-0">
                          <Check className="size-3" />
                          {c.taxIdKind}
                        </Badge>
                      )}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {(() => {
                      const ct = clientType(c.taxIdKind);
                      if (!ct) return <span className="text-muted-foreground">—</span>;
                      const Icon = ct === 'company' ? Building2 : User;
                      return (
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                          <Icon className="size-3.5" />
                          {ct === 'company' ? t('typeCompany') : t('typeIndividual')}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="px-4 py-3 text-center font-semibold tabular-nums">
                    {c._count?.matters ?? 0}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">
                    {formatMoney(c.balance ?? '0', currency, locale)}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>

        {isError && (
          <div className="space-y-2 p-8 text-center">
            <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              {t('retry')}
            </Button>
          </div>
        )}
        {!isLoading && !isError && data?.items.length === 0 && (
          <EmptyState
            icon={Users}
            title={t('empty')}
            action={
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> {t('emptyCta')}
              </Button>
            }
          />
        )}
      </Card>
    </div>
  );
}

function CreateClientDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('clients');
  const create = useCreateClient();
  const router = useRouter();
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  // 'FISCAL' = identificador fiscal de la jurisdicción (validación estricta); 'PASSPORT'/'OTHER' =
  // documento extranjero/genérico (validación ligera).
  const [docType, setDocType] = useState<'FISCAL' | 'PASSPORT' | 'OTHER'>('FISCAL');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const conflicts = useConflictCheck(name);

  const valid = name.trim().length >= 2 && taxId.trim().length >= 5;
  const conflictMatches = conflicts.data?.matches ?? [];

  async function submit() {
    setError(null);
    try {
      const client = await create.mutateAsync({
        name: name.trim(),
        taxId: taxId.trim(),
        docType: docType === 'FISCAL' ? undefined : docType,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setName('');
      setTaxId('');
      setDocType('FISCAL');
      setEmail('');
      setPhone('');
      onClose();
      router.push(`/clients/${client.id}`);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('createError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newTitle')}</DialogTitle>
          <DialogDescription>{t('newDesc')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !create.isPending) submit();
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="client-name">{t('name')}</Label>
              <Input
                id="client-name"
                name="clientName"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
              {conflictMatches.length > 0 && (
                <div className="rounded-lg border border-[var(--warning)] bg-[var(--warning-soft)] p-2.5 text-[12px]">
                  <div className="flex items-center gap-1.5 font-semibold text-[var(--warning)]">
                    <AlertTriangle className="size-3.5" />
                    {t('conflictTitle')}
                  </div>
                  <ul className="mt-1 space-y-0.5 text-muted-foreground">
                    {conflictMatches.map((m) => (
                      <li key={m.id}>
                        <span className="font-medium text-foreground">{m.name}</span> ·{' '}
                        {t('conflictMatters', { n: m.matters.length })}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <div className="grid grid-cols-[10rem_1fr] gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="client-doctype">{t('docType')}</Label>
                  <select
                    id="client-doctype"
                    value={docType}
                    onChange={(e) => setDocType(e.target.value as 'FISCAL' | 'PASSPORT' | 'OTHER')}
                    className="flex h-9 w-full rounded-md border border-input bg-[var(--surface-1)] px-2 text-sm text-foreground shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <option value="FISCAL">{t('docFiscal')}</option>
                    <option value="PASSPORT">{t('docPassport')}</option>
                    <option value="OTHER">{t('docOther')}</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="client-taxid">
                    {docType === 'FISCAL' ? t('fiscalId') : t('docId')}
                  </Label>
                  <Input
                    id="client-taxid"
                    name="taxId"
                    autoComplete="off"
                    spellCheck={false}
                    value={taxId}
                    onChange={(e) => setTaxId(e.target.value)}
                    className="font-mono"
                    placeholder={
                      docType === 'FISCAL' ? t('fiscalPlaceholder') : t('docPlaceholder')
                    }
                  />
                </div>
              </div>
              <p className="text-[11px] text-[var(--text-subtle)]">
                {docType === 'FISCAL' ? t('fiscalHint') : t('docHint')}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="client-email">{t('email')}</Label>
                <Input
                  id="client-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="client-phone">{t('phone')}</Label>
                <Input
                  id="client-phone"
                  name="tel"
                  type="tel"
                  inputMode="tel"
                  autoComplete="off"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!valid || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
