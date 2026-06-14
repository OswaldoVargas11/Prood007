'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Loader2, Plus, Users } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useClients, useCreateClient } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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

export default function ClientsPage() {
  const t = useTranslations('clients');
  const { data, isLoading, isError, refetch } = useClients();
  const [creating, setCreating] = useState(false);

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus /> {t('new')}
        </Button>
      </div>
      <CreateClientDialog open={creating} onClose={() => setCreating(false)} />

      <Card className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-3 font-medium">{t('name')}</th>
              <th className="px-4 py-3 font-medium">{t('fiscalId')}</th>
              <th className="px-4 py-3 font-medium">{t('email')}</th>
              <th className="px-4 py-3 text-center font-medium">{t('matters')}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td colSpan={4} className="px-4 py-3">
                    <Skeleton className="h-6 w-full" />
                  </td>
                </tr>
              ))}
            {!isLoading &&
              !isError &&
              data?.items.map((c) => (
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
                  <td className="px-4 py-3 text-muted-foreground">{c.email ?? '—'}</td>
                  <td className="px-4 py-3 text-center font-semibold tabular-nums">
                    {c._count?.matters ?? 0}
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
          <div className="flex flex-col items-center gap-2 p-12 text-center text-sm text-muted-foreground">
            <Users className="size-6" />
            {t('empty')}
          </div>
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
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);

  const valid = name.trim().length >= 2 && taxId.trim().length >= 5;

  async function submit() {
    setError(null);
    try {
      const client = await create.mutateAsync({
        name: name.trim(),
        taxId: taxId.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      });
      setName('');
      setTaxId('');
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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>{t('name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>
          <div className="space-y-1.5">
            <Label>{t('fiscalId')}</Label>
            <Input
              value={taxId}
              onChange={(e) => setTaxId(e.target.value)}
              className="font-mono"
              placeholder={t('fiscalPlaceholder')}
            />
            <p className="text-[11px] text-[var(--text-subtle)]">{t('fiscalHint')}</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('email')}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('phone')}</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button size="sm" onClick={submit} disabled={!valid || create.isPending}>
            {create.isPending && <Loader2 className="animate-spin" />}
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
