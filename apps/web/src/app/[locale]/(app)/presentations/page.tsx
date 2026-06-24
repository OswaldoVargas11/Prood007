'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, ListChecks, Loader2, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import {
  useCreatePresentationType,
  useDeletePresentationType,
  usePresentationTypes,
  useSeedPresentationCatalog,
  useUpdatePresentationType,
} from '@/lib/hooks';
import type { PresentationType } from '@/lib/types';
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
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

export default function PresentationsPage() {
  const t = useTranslations('presentations');
  const tc = useTranslations('common');
  const { hasRole } = useAuth();
  const isAdmin = hasRole('FIRM_ADMIN');
  const { data, isLoading } = usePresentationTypes();
  const seed = useSeedPresentationCatalog();
  const remove = useDeletePresentationType();
  const [editing, setEditing] = useState<PresentationType | 'new' | null>(null);
  const [deleting, setDeleting] = useState<PresentationType | null>(null);

  // Agrupar por sector para una lectura más clara.
  const bySector = (data ?? []).reduce<Record<string, PresentationType[]>>((acc, ty) => {
    (acc[ty.sector] ??= []).push(ty);
    return acc;
  }, {});

  return (
    <div className="mx-auto max-w-[960px] space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex gap-2">
          {isAdmin && (
            <Button
              size="sm"
              variant="outline"
              disabled={seed.isPending}
              onClick={() => seed.mutate()}
            >
              {seed.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('importSample')}
            </Button>
          )}
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> {t('new')}
          </Button>
        </div>
      </div>

      <p className="rounded-lg border border-[var(--seal-line)] bg-[var(--seal-soft)] px-3 py-2 text-[12.5px] text-[var(--seal-strong)]">
        {t('reviewNotice')}
      </p>

      {isLoading && <Skeleton className="h-40 w-full rounded-xl" />}
      {!isLoading && (data ?? []).length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <ListChecks className="size-6" />
            {t('empty')}
          </CardContent>
        </Card>
      )}

      {Object.entries(bySector).map(([sector, types]) => (
        <div key={sector} className="space-y-2">
          <h2 className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            {sector}
          </h2>
          <div className="space-y-2">
            {types.map((ty) => (
              <Card key={ty.id}>
                <CardContent className="flex items-start gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{ty.name}</span>
                      {ty.jurisdiction && (
                        <span className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10px] font-semibold uppercase text-muted-foreground">
                          {ty.jurisdiction === 'es' ? 'ES' : 'RD'}
                        </span>
                      )}
                    </div>
                    {ty.description && (
                      <div className="text-[12.5px] text-muted-foreground">{ty.description}</div>
                    )}
                    <div className="mt-1 text-[12px] text-muted-foreground">
                      {t('reqCount', { count: ty.requirements.length })}
                    </div>
                  </div>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(ty)}>
                      <Pencil /> {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setDeleting(ty)}
                      aria-label={tc('delete')}
                    >
                      <Trash2 className="text-[var(--danger)]" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      ))}

      <PresentationTypeDialog type={editing} onClose={() => setEditing(null)} />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('confirmDelete', { name: deleting?.name ?? '' })}
        confirmLabel={tc('delete')}
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

interface ReqRow {
  name: string;
  description: string;
  required: boolean;
}

function PresentationTypeDialog({
  type,
  onClose,
}: {
  type: PresentationType | 'new' | null;
  onClose: () => void;
}) {
  const t = useTranslations('presentations');
  const tc = useTranslations('common');
  const create = useCreatePresentationType();
  const update = useUpdatePresentationType();
  const existing = type && type !== 'new' ? type : null;

  const [name, setName] = useState('');
  const [sector, setSector] = useState('');
  const [jurisdiction, setJurisdiction] = useState<'' | 'es' | 'do'>('');
  const [description, setDescription] = useState('');
  const [reqs, setReqs] = useState<ReqRow[]>([]);
  const [initId, setInitId] = useState<string | null>(null);

  const currentId = existing?.id ?? (type === 'new' ? 'new' : null);
  if (currentId !== initId) {
    setInitId(currentId);
    setName(existing?.name ?? '');
    setSector(existing?.sector ?? '');
    setJurisdiction((existing?.jurisdiction as 'es' | 'do' | null) ?? '');
    setDescription(existing?.description ?? '');
    setReqs(
      existing?.requirements.map((r) => ({
        name: r.name,
        description: r.description ?? '',
        required: r.required,
      })) ?? [{ name: '', description: '', required: true }],
    );
  }

  const valid = name.trim().length >= 2 && sector.trim().length >= 1;
  const pending = create.isPending || update.isPending;

  function setReq(i: number, patch: Partial<ReqRow>) {
    setReqs((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  async function submit() {
    const requirements = reqs
      .filter((r) => r.name.trim())
      .map((r) => ({
        name: r.name.trim(),
        description: r.description.trim() || undefined,
        required: r.required,
      }));
    const body = {
      name: name.trim(),
      sector: sector.trim(),
      jurisdiction: jurisdiction === '' ? null : jurisdiction,
      description: description.trim() || undefined,
      requirements,
    };
    if (existing) await update.mutateAsync({ id: existing.id, ...body });
    else await create.mutateAsync(body);
    onClose();
  }

  return (
    <Dialog open={type !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{existing ? t('editTitle') : t('newTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDesc')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !pending) void submit();
          }}
          className="space-y-3"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pt-name">{t('name')}</Label>
              <Input
                id="pt-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-sector">{t('sector')}</Label>
              <Input id="pt-sector" value={sector} onChange={(e) => setSector(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pt-jur">{t('jurisdiction')}</Label>
              <select
                id="pt-jur"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value as '' | 'es' | 'do')}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('jurBoth')}</option>
                <option value="es">España</option>
                <option value="do">República Dominicana</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pt-desc">{t('description')}</Label>
              <Input
                id="pt-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>{t('requirements')}</Label>
            {reqs.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r.name}
                  onChange={(e) => setReq(i, { name: e.target.value })}
                  placeholder={t('reqNamePlaceholder')}
                  className="flex-1"
                />
                <label className="flex items-center gap-1 text-[11px] text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={r.required}
                    onChange={(e) => setReq(i, { required: e.target.checked })}
                  />
                  {t('reqRequired')}
                </label>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={tc('delete')}
                  onClick={() => setReqs((rs) => rs.filter((_, idx) => idx !== i))}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() =>
                setReqs((rs) => [...rs, { name: '', description: '', required: true }])
              }
            >
              <Plus className="size-4" /> {t('addRequirement')}
            </Button>
          </div>

          <DialogFooter className="mt-2">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {tc('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!valid || pending}>
              {pending && <Loader2 className="animate-spin" />}
              {tc('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
