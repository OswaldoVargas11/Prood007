'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { ArrowRight, Link2, Loader2, Plus, UserPlus, X } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import {
  useConvertLead,
  useCreateLead,
  useDeleteLead,
  useIntakeLink,
  useLeads,
  useUpdateLead,
} from '@/lib/hooks';
import { toastMsg } from '@/lib/toasts';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
import type { Lead, LeadStatus } from '@/lib/types';

const ACTIVE: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED'];
const COLUMNS: LeadStatus[] = ['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST'];
const NEXT: Partial<Record<LeadStatus, LeadStatus>> = {
  NEW: 'CONTACTED',
  CONTACTED: 'QUALIFIED',
};

export default function LeadsPage() {
  const t = useTranslations('leads');
  const { data, isLoading, isError } = useLeads();
  const intake = useIntakeLink();
  const [creating, setCreating] = useState(false);
  const [converting, setConverting] = useState<Lead | null>(null);

  const byStatus = useMemo(() => {
    const m = new Map<LeadStatus, Lead[]>();
    for (const c of COLUMNS) m.set(c, []);
    for (const l of data ?? []) m.get(l.status)?.push(l);
    return m;
  }, [data]);

  function shareIntake() {
    const token = intake.data?.token;
    if (!token) {
      toast.error(t('intakeLinkPending'));
      return;
    }
    const url = `${window.location.origin}/es/intake/${token}`;
    navigator.clipboard.writeText(url).then(() => toast.success(toastMsg.intakeLinkCopied));
  }

  return (
    <div className="mx-auto max-w-[1300px] space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={shareIntake} disabled={intake.isLoading}>
            <Link2 /> {t('shareIntake')}
          </Button>
          <Button size="sm" onClick={() => setCreating(true)}>
            <Plus /> {t('new')}
          </Button>
        </div>
      </div>

      {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>}

      {!isLoading && !isError && (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {COLUMNS.map((col) => {
            const items = byStatus.get(col) ?? [];
            return (
              <div key={col} className="w-[260px] shrink-0">
                <div className="mb-2 flex items-center justify-between px-1">
                  <span className="text-[12.5px] font-semibold">{t(`status.${col}`)}</span>
                  <Badge variant="secondary">{items.length}</Badge>
                </div>
                <div className="space-y-2">
                  {items.map((l) => (
                    <LeadCard key={l.id} lead={l} onConvert={() => setConverting(l)} />
                  ))}
                  {items.length === 0 && (
                    <div className="rounded-lg border border-dashed py-6 text-center text-[11.5px] text-muted-foreground">
                      {t('emptyColumn')}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CreateLeadDialog open={creating} onClose={() => setCreating(false)} />
      <ConvertLeadDialog lead={converting} onClose={() => setConverting(null)} />
    </div>
  );
}

function LeadCard({ lead, onConvert }: { lead: Lead; onConvert: () => void }) {
  const t = useTranslations('leads');
  const router = useRouter();
  const update = useUpdateLead();
  const del = useDeleteLead();
  const [confirmDel, setConfirmDel] = useState(false);
  const next = NEXT[lead.status];
  const active = ACTIVE.includes(lead.status);

  return (
    <div className="rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-medium">{lead.name}</div>
          {lead.company && (
            <div className="truncate text-[11.5px] text-muted-foreground">{lead.company}</div>
          )}
        </div>
        <Badge variant={lead.source === 'intake' ? 'info' : 'secondary'} className="shrink-0">
          {lead.source === 'intake' ? t('sourceIntake') : t('sourceManual')}
        </Badge>
      </div>
      {(lead.email || lead.phone) && (
        <div className="mt-1 truncate text-[11.5px] text-muted-foreground">
          {[lead.email, lead.phone].filter(Boolean).join(' · ')}
        </div>
      )}
      {lead.subject && <div className="mt-1 line-clamp-2 text-[12px]">{lead.subject}</div>}

      {active && (
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
          {next && (
            <Button
              size="sm"
              variant="outline"
              disabled={update.isPending}
              onClick={() => update.mutate({ id: lead.id, status: next })}
            >
              {t(`status.${next}`)} <ArrowRight className="size-3.5" />
            </Button>
          )}
          <Button size="sm" onClick={onConvert}>
            <UserPlus className="size-3.5" /> {t('convert')}
          </Button>
          <button
            type="button"
            aria-label={t('discard')}
            title={t('discard')}
            disabled={update.isPending}
            onClick={() => update.mutate({ id: lead.id, status: 'LOST' })}
            className="ml-auto rounded-md p-1 text-muted-foreground outline-none hover:text-[var(--danger)] focus-visible:ring-2 focus-visible:ring-ring"
          >
            <X aria-hidden className="size-4" />
          </button>
        </div>
      )}
      {lead.status === 'CONVERTED' && lead.convertedClientId && (
        <Button
          size="sm"
          variant="outline"
          className="mt-2.5"
          onClick={() => router.push(`/clients/${lead.convertedClientId}`)}
        >
          {t('viewClient')} <ArrowRight className="size-3.5" />
        </Button>
      )}
      {lead.status === 'LOST' && (
        <button
          type="button"
          disabled={del.isPending}
          onClick={() => setConfirmDel(true)}
          className="mt-2 rounded-sm text-[11px] text-muted-foreground outline-none hover:text-[var(--danger)] focus-visible:ring-2 focus-visible:ring-ring"
        >
          {t('delete')}
        </button>
      )}
      <ConfirmDialog
        open={confirmDel}
        onOpenChange={setConfirmDel}
        title={t('deleteConfirmTitle')}
        description={t('deleteConfirmBody', { name: lead.name })}
        confirmLabel={t('delete')}
        loading={del.isPending}
        onConfirm={() => del.mutate(lead.id, { onSuccess: () => setConfirmDel(false) })}
      />
    </div>
  );
}

function CreateLeadDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('leads');
  const create = useCreateLead();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');

  async function submit() {
    if (name.trim().length < 2) return;
    await create.mutateAsync({
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      subject: subject.trim() || undefined,
    });
    setName('');
    setEmail('');
    setPhone('');
    setSubject('');
    onClose();
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newTitle')}</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim().length >= 2 && !create.isPending) submit();
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>{t('name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
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
            <div className="space-y-1.5">
              <Label>{t('subjectField')}</Label>
              <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            </div>
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={name.trim().length < 2 || create.isPending}>
              {create.isPending && <Loader2 className="animate-spin" />}
              {t('create')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ConvertLeadDialog({ lead, onClose }: { lead: Lead | null; onClose: () => void }) {
  const t = useTranslations('leads');
  const convert = useConvertLead();
  const router = useRouter();
  const [taxId, setTaxId] = useState('');
  const [docType, setDocType] = useState<'FISCAL' | 'PASSPORT' | 'OTHER'>('FISCAL');
  const [createMatter, setCreateMatter] = useState(true);
  const [matterTitle, setMatterTitle] = useState('');
  const [error, setError] = useState<string | null>(null);

  if (!lead) return null;

  async function submit() {
    setError(null);
    try {
      const r = await convert.mutateAsync({
        id: lead!.id,
        taxId: taxId.trim(),
        docType: docType === 'FISCAL' ? undefined : docType,
        createMatter,
        matterTitle: matterTitle.trim() || undefined,
      });
      toast.success(toastMsg.leadConverted);
      onClose();
      router.push(r.matterId ? `/matters/${r.matterId}` : `/clients/${r.clientId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : t('convertError'));
    }
  }

  return (
    <Dialog open={!!lead} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('convertTitle', { name: lead.name })}</DialogTitle>
          <DialogDescription>{t('convertDesc')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[10rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label>{t('docType')}</Label>
              <select
                value={docType}
                onChange={(e) => setDocType(e.target.value as 'FISCAL' | 'PASSPORT' | 'OTHER')}
                className="flex h-9 w-full rounded-md border border-input bg-[var(--surface-1)] px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="FISCAL">{t('docFiscal')}</option>
                <option value="PASSPORT">{t('docPassport')}</option>
                <option value="OTHER">{t('docOther')}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('taxId')}</Label>
              <Input
                value={taxId}
                onChange={(e) => setTaxId(e.target.value)}
                className="font-mono"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={createMatter}
              onChange={(e) => setCreateMatter(e.target.checked)}
            />
            {t('createMatter')}
          </label>
          {createMatter && (
            <div className="space-y-1.5">
              <Label>{t('matterTitle')}</Label>
              <Input
                value={matterTitle}
                onChange={(e) => setMatterTitle(e.target.value)}
                placeholder={lead.subject ?? ''}
              />
            </div>
          )}
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            onClick={submit}
            disabled={taxId.trim().length < 5 || convert.isPending}
          >
            {convert.isPending && <Loader2 className="animate-spin" />}
            {t('convert')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
