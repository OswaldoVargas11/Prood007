'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarClock,
  Check,
  ClipboardCopy,
  FileText,
  Loader2,
  Plus,
  Trash2,
  Users,
} from 'lucide-react';
import { useDeal, useDealActions, useMatterDocuments } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import type {
  DealMilestone,
  DealMilestoneKind,
  DealMilestoneStatus,
  DealParty,
  DealPartyRole,
  DealPartySide,
  DisclosureSchedule,
  DisclosureScheduleStatus,
  RegistryFiling,
  RegistryFilingStatus,
  RegistryKind,
} from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const selectClass =
  'flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

const SIDES: DealPartySide[] = ['BUYER', 'SELLER', 'COMPANY', 'LENDER', 'BORROWER', 'OTHER'];
const ROLES: DealPartyRole[] = [
  'PRINCIPAL',
  'LEGAL_COUNSEL',
  'FINANCIAL_ADVISOR',
  'NOTARY',
  'OTHER',
];
const MILESTONE_KINDS: DealMilestoneKind[] = [
  'SIGNING',
  'CLOSING',
  'LONGSTOP',
  'CONDITIONS_DEADLINE',
  'FUNDS_FLOW',
  'FILING',
  'CUSTOM',
];
const MILESTONE_STATUSES: DealMilestoneStatus[] = ['PENDING', 'DONE', 'MISSED'];
const DISCLOSURE_STATUSES: DisclosureScheduleStatus[] = ['DRAFT', 'AGREED'];
const REGISTRIES: RegistryKind[] = [
  'REGISTRO_MERCANTIL',
  'REGISTRO_PROPIEDAD',
  'INDICE_UNICO_NOTARIAL',
  'NOTARIA',
  'REGISTRO_TITULOS_RD',
  'CAMARA_COMERCIO_RD',
  'OTHER',
];
const FILING_STATUSES: RegistryFilingStatus[] = ['PENDING', 'SUBMITTED', 'REGISTERED', 'REJECTED'];

type Actions = ReturnType<typeof useDealActions>;

export function DealCockpitTab({ matterId }: { matterId: string }) {
  const { data, isLoading } = useDeal(matterId);
  const actions = useDealActions(matterId);

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-4">
      <PartiesCard parties={data.parties} actions={actions} />
      <MilestonesCard milestones={data.milestones} actions={actions} />
      <DisclosuresCard
        disclosures={data.disclosureSchedules}
        actions={actions}
        matterId={matterId}
      />
      <FilingsCard filings={data.registryFilings} actions={actions} matterId={matterId} />
    </div>
  );
}

// ── Partes / working group ────────────────────────────────────────────────────

function PartiesCard({ parties, actions }: { parties: DealParty[]; actions: Actions }) {
  const t = useTranslations('deal');
  const [editing, setEditing] = useState<DealParty | null>(null);
  const [adding, setAdding] = useState(false);
  const [copied, setCopied] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<DealPartySide, DealParty[]>();
    for (const side of SIDES) map.set(side, []);
    parties.forEach((p) => map.get(p.side)?.push(p));
    return map;
  }, [parties]);

  const distributionEmails = parties
    .filter((p) => p.isDistribution && p.email)
    .map((p) => p.email as string);

  const copyDistribution = async () => {
    await navigator.clipboard.writeText(distributionEmails.join(', '));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold">{t('parties.title')}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={distributionEmails.length === 0}
              onClick={copyDistribution}
            >
              {copied ? <Check className="size-4" /> : <ClipboardCopy className="size-4" />}
              {t('parties.copyDistribution')}
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> {t('add')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('parties.hint')}</p>

        {parties.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('parties.empty')}</p>
        ) : (
          <div className="space-y-4">
            {SIDES.map((side) => {
              const list = grouped.get(side) ?? [];
              if (list.length === 0) return null;
              return (
                <div key={side} className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-strong)]">
                    {t(`side.${side}`)}{' '}
                    <span className="text-muted-foreground">({list.length})</span>
                  </h4>
                  <div className="space-y-2">
                    {list.map((p) => (
                      <div
                        key={p.id}
                        className="flex items-start gap-3 rounded-lg border bg-[var(--surface-1)] p-3"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-medium">{p.name}</span>
                            <Badge variant="secondary">{t(`role.${p.role}`)}</Badge>
                            {p.isDistribution && (
                              <Badge variant="outline">{t('parties.distribution')}</Badge>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                            {p.organization && <span>{p.organization}</span>}
                            {p.email && <span>{p.email}</span>}
                            {p.phone && <span>{p.phone}</span>}
                          </div>
                          {p.notes && (
                            <p className="mt-1 text-xs text-muted-foreground">{p.notes}</p>
                          )}
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEditing(p)}
                          >
                            {t('edit')}
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-2"
                            aria-label={t('delete')}
                            onClick={() => actions.removeParty.mutate(p.id)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {(adding || editing) && (
        <PartyEditor
          actions={actions}
          party={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function PartyEditor({
  actions,
  party,
  onClose,
}: {
  actions: Actions;
  party: DealParty | null;
  onClose: () => void;
}) {
  const t = useTranslations('deal');
  const [name, setName] = useState(party?.name ?? '');
  const [side, setSide] = useState<DealPartySide>(party?.side ?? 'BUYER');
  const [role, setRole] = useState<DealPartyRole>(party?.role ?? 'PRINCIPAL');
  const [organization, setOrganization] = useState(party?.organization ?? '');
  const [email, setEmail] = useState(party?.email ?? '');
  const [phone, setPhone] = useState(party?.phone ?? '');
  const [isDistribution, setIsDistribution] = useState(party?.isDistribution ?? false);
  const [notes, setNotes] = useState(party?.notes ?? '');

  const pending = actions.addParty.isPending || actions.updateParty.isPending;

  const save = () => {
    if (!name.trim()) return;
    const body = {
      name: name.trim(),
      side,
      role,
      organization,
      email,
      phone,
      isDistribution,
      notes,
    };
    if (party) {
      actions.updateParty.mutate({ id: party.id, ...body }, { onSuccess: onClose });
    } else {
      actions.addParty.mutate(body, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{party ? t('parties.editTitle') : t('parties.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dp-name">{t('parties.name')}</Label>
            <Input id="dp-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-side">{t('parties.side')}</Label>
              <select
                id="dp-side"
                value={side}
                onChange={(e) => setSide(e.target.value as DealPartySide)}
                className={selectClass}
              >
                {SIDES.map((s) => (
                  <option key={s} value={s}>
                    {t(`side.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-role">{t('parties.role')}</Label>
              <select
                id="dp-role"
                value={role}
                onChange={(e) => setRole(e.target.value as DealPartyRole)}
                className={selectClass}
              >
                {ROLES.map((r) => (
                  <option key={r} value={r}>
                    {t(`role.${r}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-org">{t('parties.organization')}</Label>
            <Input
              id="dp-org"
              value={organization}
              onChange={(e) => setOrganization(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dp-email">{t('parties.email')}</Label>
              <Input
                id="dp-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dp-phone">{t('parties.phone')}</Label>
              <Input id="dp-phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-notes">{t('parties.notes')}</Label>
            <Textarea
              id="dp-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isDistribution}
              onChange={(e) => setIsDistribution(e.target.checked)}
            />
            {t('parties.isDistribution')}
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={!name.trim() || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Hitos / calendario de la operación ────────────────────────────────────────

function milestoneStatusVariant(s: DealMilestoneStatus): 'default' | 'secondary' | 'outline' {
  if (s === 'DONE') return 'default';
  if (s === 'MISSED') return 'secondary';
  return 'outline';
}

function MilestonesCard({
  milestones,
  actions,
}: {
  milestones: DealMilestone[];
  actions: Actions;
}) {
  const t = useTranslations('deal');
  const tStatus = useTranslations('deal.milestoneStatus');
  const locale = useLocale();
  const [editing, setEditing] = useState<DealMilestone | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(
    () =>
      [...milestones].sort(
        (a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime(),
      ),
    [milestones],
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CalendarClock className="size-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold">{t('milestones.title')}</h3>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t('add')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('milestones.hint')}</p>

        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('milestones.empty')}</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((m) => (
              <div
                key={m.id}
                className="flex items-start gap-3 rounded-lg border bg-[var(--surface-1)] p-3"
              >
                <select
                  value={m.status}
                  onChange={(e) =>
                    actions.updateMilestone.mutate({
                      id: m.id,
                      status: e.target.value as DealMilestoneStatus,
                    })
                  }
                  className="h-8 shrink-0 rounded-md border bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {MILESTONE_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {tStatus(s)}
                    </option>
                  ))}
                </select>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {m.kind === 'LONGSTOP' ? (
                      <Badge className="bg-[var(--danger)] text-white hover:bg-[var(--danger)]">
                        {t('milestoneKind.LONGSTOP')}
                      </Badge>
                    ) : (
                      <Badge variant="secondary">{t(`milestoneKind.${m.kind}`)}</Badge>
                    )}
                    <span className="text-sm font-medium">{m.title}</span>
                    <Badge variant={milestoneStatusVariant(m.status)}>{tStatus(m.status)}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {formatDate(m.targetDate, locale)}
                    {m.notes ? ` · ${m.notes}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditing(m)}
                  >
                    {t('edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    aria-label={t('delete')}
                    onClick={() => actions.removeMilestone.mutate(m.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>

      {(adding || editing) && (
        <MilestoneEditor
          actions={actions}
          milestone={editing}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function MilestoneEditor({
  actions,
  milestone,
  onClose,
}: {
  actions: Actions;
  milestone: DealMilestone | null;
  onClose: () => void;
}) {
  const t = useTranslations('deal');
  const [title, setTitle] = useState(milestone?.title ?? '');
  const [kind, setKind] = useState<DealMilestoneKind>(milestone?.kind ?? 'CUSTOM');
  const [targetDate, setTargetDate] = useState(milestone?.targetDate?.slice(0, 10) ?? '');
  const [status, setStatus] = useState<DealMilestoneStatus>(milestone?.status ?? 'PENDING');
  const [notes, setNotes] = useState(milestone?.notes ?? '');

  const pending = actions.addMilestone.isPending || actions.updateMilestone.isPending;

  const save = () => {
    if (!title.trim() || !targetDate) return;
    if (milestone) {
      actions.updateMilestone.mutate(
        { id: milestone.id, title: title.trim(), kind, targetDate, status, notes },
        { onSuccess: onClose },
      );
    } else {
      actions.addMilestone.mutate(
        { title: title.trim(), kind, targetDate, status, notes },
        { onSuccess: onClose },
      );
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {milestone ? t('milestones.editTitle') : t('milestones.addTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dm-title">{t('milestones.titleLabel')}</Label>
            <Input id="dm-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="dm-kind">{t('milestones.kind')}</Label>
              <select
                id="dm-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as DealMilestoneKind)}
                className={selectClass}
              >
                {MILESTONE_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`milestoneKind.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dm-date">{t('milestones.targetDate')}</Label>
              <Input
                id="dm-date"
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="dm-status">{t('milestones.status')}</Label>
              <select
                id="dm-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DealMilestoneStatus)}
                className={selectClass}
              >
                {MILESTONE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`milestoneStatus.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dm-notes">{t('milestones.notes')}</Label>
            <Textarea
              id="dm-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={!title.trim() || !targetDate || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Disclosure schedules ──────────────────────────────────────────────────────

function DisclosuresCard({
  disclosures,
  actions,
  matterId,
}: {
  disclosures: DisclosureSchedule[];
  actions: Actions;
  matterId: string;
}) {
  const t = useTranslations('deal');
  const tStatus = useTranslations('deal.disclosureStatus');
  const { data: documents } = useMatterDocuments(matterId);
  const [editing, setEditing] = useState<DisclosureSchedule | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(
    () =>
      [...disclosures].sort((a, b) =>
        a.number.localeCompare(b.number, undefined, { numeric: true }),
      ),
    [disclosures],
  );

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold">{t('disclosures.title')}</h3>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t('add')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('disclosures.hint')}</p>

        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('disclosures.empty')}</p>
        ) : (
          <div className="space-y-2">
            {sorted.map((d) => {
              const docName = documents?.find((doc) => doc.id === d.documentId)?.name;
              return (
                <div
                  key={d.id}
                  className="flex items-start gap-3 rounded-lg border bg-[var(--surface-1)] p-3"
                >
                  <Badge variant="outline" className="shrink-0 font-mono">
                    {d.number}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium">{d.title}</span>
                      <Badge variant={d.status === 'AGREED' ? 'default' : 'outline'}>
                        {tStatus(d.status)}
                      </Badge>
                      {docName && (
                        <Badge variant="outline" className="gap-1">
                          <FileText className="size-3" /> {docName}
                        </Badge>
                      )}
                    </div>
                    {d.repWarranty && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t('disclosures.repWarranty')}: {d.repWarranty}
                      </p>
                    )}
                    {d.body && (
                      <p className="mt-0.5 whitespace-pre-wrap text-xs text-muted-foreground">
                        {d.body}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEditing(d)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      aria-label={t('delete')}
                      onClick={() => actions.removeDisclosure.mutate(d.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {(adding || editing) && (
        <DisclosureEditor
          actions={actions}
          disclosure={editing}
          matterId={matterId}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function DisclosureEditor({
  actions,
  disclosure,
  matterId,
  onClose,
}: {
  actions: Actions;
  disclosure: DisclosureSchedule | null;
  matterId: string;
  onClose: () => void;
}) {
  const t = useTranslations('deal');
  const { data: documents } = useMatterDocuments(matterId);
  const [number, setNumber] = useState(disclosure?.number ?? '');
  const [title, setTitle] = useState(disclosure?.title ?? '');
  const [repWarranty, setRepWarranty] = useState(disclosure?.repWarranty ?? '');
  const [body, setBody] = useState(disclosure?.body ?? '');
  const [documentId, setDocumentId] = useState(disclosure?.documentId ?? '');
  const [status, setStatus] = useState<DisclosureScheduleStatus>(disclosure?.status ?? 'DRAFT');

  const pending = actions.addDisclosure.isPending || actions.updateDisclosure.isPending;

  const save = () => {
    if (!number.trim() || !title.trim()) return;
    const fields = {
      number: number.trim(),
      title: title.trim(),
      repWarranty,
      body,
      documentId,
      status,
    };
    if (disclosure) {
      actions.updateDisclosure.mutate({ id: disclosure.id, ...fields }, { onSuccess: onClose });
    } else {
      actions.addDisclosure.mutate(fields, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {disclosure ? t('disclosures.editTitle') : t('disclosures.addTitle')}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-[8rem_1fr] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ds-number">{t('disclosures.number')}</Label>
              <Input id="ds-number" value={number} onChange={(e) => setNumber(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-title">{t('disclosures.titleLabel')}</Label>
              <Input id="ds-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-rep">{t('disclosures.repWarranty')}</Label>
            <Input
              id="ds-rep"
              value={repWarranty}
              onChange={(e) => setRepWarranty(e.target.value)}
              placeholder={t('disclosures.repWarrantyPlaceholder')}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ds-body">{t('disclosures.body')}</Label>
            <Textarea
              id="ds-body"
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ds-status">{t('disclosures.status')}</Label>
              <select
                id="ds-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as DisclosureScheduleStatus)}
                className={selectClass}
              >
                {DISCLOSURE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`disclosureStatus.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ds-doc">{t('disclosures.document')}</Label>
              <select
                id="ds-doc"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className={selectClass}
              >
                <option value="">{t('none')}</option>
                {documents?.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={!number.trim() || !title.trim() || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Presentaciones registrales / filings ──────────────────────────────────────

function filingStatusVariant(s: RegistryFilingStatus): 'default' | 'secondary' | 'outline' {
  if (s === 'REGISTERED') return 'default';
  if (s === 'REJECTED') return 'secondary';
  return 'outline';
}

function FilingsCard({
  filings,
  actions,
  matterId,
}: {
  filings: RegistryFiling[];
  actions: Actions;
  matterId: string;
}) {
  const t = useTranslations('deal');
  const tStatus = useTranslations('deal.filingStatus');
  const tReg = useTranslations('deal.registry');
  const locale = useLocale();
  const { data: documents } = useMatterDocuments(matterId);
  const [editing, setEditing] = useState<RegistryFiling | null>(null);
  const [adding, setAdding] = useState(false);

  return (
    <Card>
      <CardContent className="space-y-3 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText className="size-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold">{t('filings.title')}</h3>
          </div>
          <Button size="sm" variant="outline" className="h-8" onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t('add')}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t('filings.hint')}</p>

        {filings.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('filings.empty')}</p>
        ) : (
          <div className="space-y-2">
            {filings.map((f) => {
              const docName = documents?.find((doc) => doc.id === f.documentId)?.name;
              const dates: string[] = [];
              if (f.submittedAt)
                dates.push(`${t('filings.submittedAt')}: ${formatDate(f.submittedAt, locale)}`);
              if (f.registeredAt)
                dates.push(`${t('filings.registeredAt')}: ${formatDate(f.registeredAt, locale)}`);
              return (
                <div
                  key={f.id}
                  className="flex items-start gap-3 rounded-lg border bg-[var(--surface-1)] p-3"
                >
                  <select
                    value={f.status}
                    onChange={(e) =>
                      actions.updateFiling.mutate({
                        id: f.id,
                        status: e.target.value as RegistryFilingStatus,
                      })
                    }
                    className="h-8 shrink-0 rounded-md border bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {FILING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {tStatus(s)}
                      </option>
                    ))}
                  </select>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary">{tReg(f.registry)}</Badge>
                      <span className="text-sm font-medium">{f.title}</span>
                      <Badge variant={filingStatusVariant(f.status)}>{tStatus(f.status)}</Badge>
                      {docName && (
                        <Badge variant="outline" className="gap-1">
                          <FileText className="size-3" /> {docName}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {f.referenceCode && <span className="font-mono">{f.referenceCode}</span>}
                      {dates.length > 0 && <span>{dates.join(' · ')}</span>}
                    </div>
                    {f.notes && <p className="mt-0.5 text-xs text-muted-foreground">{f.notes}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs"
                      onClick={() => setEditing(f)}
                    >
                      {t('edit')}
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2"
                      aria-label={t('delete')}
                      onClick={() => actions.removeFiling.mutate(f.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>

      {(adding || editing) && (
        <FilingEditor
          actions={actions}
          filing={editing}
          matterId={matterId}
          onClose={() => {
            setAdding(false);
            setEditing(null);
          }}
        />
      )}
    </Card>
  );
}

function FilingEditor({
  actions,
  filing,
  matterId,
  onClose,
}: {
  actions: Actions;
  filing: RegistryFiling | null;
  matterId: string;
  onClose: () => void;
}) {
  const t = useTranslations('deal');
  const { data: documents } = useMatterDocuments(matterId);
  const [title, setTitle] = useState(filing?.title ?? '');
  const [registry, setRegistry] = useState<RegistryKind>(filing?.registry ?? 'REGISTRO_MERCANTIL');
  const [referenceCode, setReferenceCode] = useState(filing?.referenceCode ?? '');
  const [status, setStatus] = useState<RegistryFilingStatus>(filing?.status ?? 'PENDING');
  const [submittedAt, setSubmittedAt] = useState(filing?.submittedAt?.slice(0, 10) ?? '');
  const [registeredAt, setRegisteredAt] = useState(filing?.registeredAt?.slice(0, 10) ?? '');
  const [documentId, setDocumentId] = useState(filing?.documentId ?? '');
  const [notes, setNotes] = useState(filing?.notes ?? '');

  const pending = actions.addFiling.isPending || actions.updateFiling.isPending;

  const save = () => {
    if (!title.trim()) return;
    const fields = {
      title: title.trim(),
      registry,
      referenceCode,
      status,
      submittedAt,
      registeredAt,
      documentId,
      notes,
    };
    if (filing) {
      actions.updateFiling.mutate({ id: filing.id, ...fields }, { onSuccess: onClose });
    } else {
      actions.addFiling.mutate(fields, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{filing ? t('filings.editTitle') : t('filings.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="rf-title">{t('filings.titleLabel')}</Label>
            <Input id="rf-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rf-registry">{t('filings.registryLabel')}</Label>
              <select
                id="rf-registry"
                value={registry}
                onChange={(e) => setRegistry(e.target.value as RegistryKind)}
                className={selectClass}
              >
                {REGISTRIES.map((r) => (
                  <option key={r} value={r}>
                    {t(`registry.${r}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-ref">{t('filings.referenceCode')}</Label>
              <Input
                id="rf-ref"
                value={referenceCode}
                onChange={(e) => setReferenceCode(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-status">{t('filings.status')}</Label>
              <select
                id="rf-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as RegistryFilingStatus)}
                className={selectClass}
              >
                {FILING_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`filingStatus.${s}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-doc">{t('filings.document')}</Label>
              <select
                id="rf-doc"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className={selectClass}
              >
                <option value="">{t('none')}</option>
                {documents?.map((doc) => (
                  <option key={doc.id} value={doc.id}>
                    {doc.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-submitted">{t('filings.submittedAt')}</Label>
              <Input
                id="rf-submitted"
                type="date"
                value={submittedAt}
                onChange={(e) => setSubmittedAt(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rf-registered">{t('filings.registeredAt')}</Label>
              <Input
                id="rf-registered"
                type="date"
                value={registeredAt}
                onChange={(e) => setRegisteredAt(e.target.value)}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="rf-notes">{t('filings.notes')}</Label>
            <Textarea
              id="rf-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={!title.trim() || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
