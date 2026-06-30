'use client';

import { useMemo, useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import {
  CalendarClock,
  Check,
  ClipboardCopy,
  Download,
  FileText,
  Loader2,
  Lock,
  Plus,
  Trash2,
  TriangleAlert,
  Users,
  Wallet,
} from 'lucide-react';
import {
  downloadFundsFlowStatement,
  useDeal,
  useDealActions,
  useFundsFlow,
  useFundsFlowActions,
  useMatterDocuments,
  useMatterReadiness,
} from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import type {
  DealFundsFlowLine,
  DealMilestone,
  DealMilestoneKind,
  DealMilestoneStatus,
  DealParty,
  DealPartyRole,
  DealPartySide,
  DisclosureSchedule,
  DisclosureScheduleStatus,
  EscrowHolding,
  FundsFlowKind,
  FundsFlowStatus,
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
      <FundsFlowCard matterId={matterId} parties={data.parties} />
      <MilestonesCard matterId={matterId} milestones={data.milestones} actions={actions} />
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

// ── Funds flow / escrow (closing statement) ───────────────────────────────────

const FUNDS_FLOW_KINDS: FundsFlowKind[] = [
  'PAYMENT',
  'ESCROW_DEPOSIT',
  'ESCROW_RELEASE',
  'FEE',
  'ADJUSTMENT',
];
const FUNDS_FLOW_STATUSES: FundsFlowStatus[] = ['PLANNED', 'SETTLED'];

type FundsFlowActions = ReturnType<typeof useFundsFlowActions>;

function fmtMoney(amount: string | number, currency: string): string {
  const n = typeof amount === 'number' ? amount : Number(amount);
  const formatted = Number.isFinite(n)
    ? n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : String(amount);
  return `${formatted} ${currency}`;
}

function FundsFlowCard({ matterId, parties }: { matterId: string; parties: DealParty[] }) {
  const t = useTranslations('deal.fundsFlow');
  const tDeal = useTranslations('deal');
  const { data, isLoading } = useFundsFlow(matterId);
  const actions = useFundsFlowActions(matterId);
  const [editingLine, setEditingLine] = useState<DealFundsFlowLine | null>(null);
  const [addingLine, setAddingLine] = useState(false);
  const [editingHolding, setEditingHolding] = useState<EscrowHolding | null>(null);
  const [addingHolding, setAddingHolding] = useState(false);
  const [releasingHolding, setReleasingHolding] = useState<EscrowHolding | null>(null);
  const [downloading, setDownloading] = useState(false);

  const partyLabel = useMemo(() => {
    const map = new Map(parties.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? (map.get(id) ?? t('externalParty')) : '—');
  }, [parties, t]);

  const exportPdf = async () => {
    setDownloading(true);
    try {
      await downloadFundsFlowStatement(matterId, `funds-flow-${matterId}.pdf`);
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading || !data) return <Skeleton className="h-48 w-full" />;

  const { lines, escrowHoldings, reconciliation } = data;
  const hasContent = lines.length > 0 || escrowHoldings.length > 0;

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Wallet className="size-4 text-[var(--brand)]" />
            <h3 className="text-sm font-semibold">{t('title')}</h3>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              disabled={!hasContent || downloading}
              onClick={exportPdf}
            >
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('exportPdf')}
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={() => setAddingLine(true)}>
              <Plus className="size-4" /> {t('addLine')}
            </Button>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">{t('hint')}</p>

        {/* Cuadre por moneda + aviso de descuadre */}
        {reconciliation.byCurrency.length > 0 && (
          <div className="space-y-2">
            {reconciliation.byCurrency.map((c) => (
              <div
                key={c.currency}
                className={`flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-xs ${
                  c.balanced
                    ? 'bg-[var(--surface-1)]'
                    : 'border-[var(--danger)]/40 bg-[var(--danger)]/5'
                }`}
              >
                <div className="flex items-center gap-2">
                  {c.balanced ? (
                    <Check className="size-4 text-[var(--success,#15803d)]" />
                  ) : (
                    <TriangleAlert className="size-4 text-[var(--danger)]" />
                  )}
                  <span className="font-semibold">{c.currency}</span>
                  <span className="text-muted-foreground">
                    {t('paid')} {fmtMoney(c.totalPaid, c.currency)} · {t('received')}{' '}
                    {fmtMoney(c.totalReceived, c.currency)}
                  </span>
                </div>
                <span
                  className={c.balanced ? 'font-medium text-[var(--success,#15803d)]' : 'font-semibold text-[var(--danger)]'}
                >
                  {c.balanced
                    ? t('balanced')
                    : t('imbalance', { amount: fmtMoney(c.imbalance, c.currency) })}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Totales por parte */}
        {reconciliation.byParty.length > 0 && (
          <div className="space-y-1">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-[var(--brand-strong)]">
              {t('byParty')}
            </h4>
            <div className="grid gap-1 sm:grid-cols-2">
              {reconciliation.byParty.map((p) => (
                <div
                  key={`${p.partyId}-${p.currency}`}
                  className="flex items-center justify-between rounded-md border bg-[var(--surface-1)] px-2.5 py-1.5 text-xs"
                >
                  <span className="truncate font-medium">{partyLabel(p.partyId)}</span>
                  <span
                    className={p.net < 0 ? 'text-[var(--danger)]' : 'text-[var(--success,#15803d)]'}
                  >
                    {p.net >= 0 ? '+' : ''}
                    {fmtMoney(p.net, p.currency)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Líneas del funds-flow */}
        {lines.length === 0 ? (
          <p className="text-xs text-muted-foreground">{t('emptyLines')}</p>
        ) : (
          <div className="space-y-2">
            {lines.map((l) => (
              <div
                key={l.id}
                className="flex items-start gap-3 rounded-lg border bg-[var(--surface-1)] p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">{t(`kind.${l.kind}`)}</Badge>
                    <span className="text-sm font-medium">{fmtMoney(l.amount, l.currency)}</span>
                    <Badge variant={l.status === 'SETTLED' ? 'default' : 'outline'}>
                      {t(`status.${l.status}`)}
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {partyLabel(l.payerPartyId)} → {partyLabel(l.payeePartyId)}
                  </div>
                  {(l.account || l.condition) && (
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                      {l.account && <span>{t('account')}: {l.account}</span>}
                      {l.condition && <span>{t('condition')}: {l.condition}</span>}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={() => setEditingLine(l)}
                  >
                    {tDeal('edit')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2"
                    aria-label={t('deleteLine')}
                    onClick={() => actions.removeLine.mutate(l.id)}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Escrow */}
        <div className="space-y-2 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Lock className="size-4 text-[var(--brand)]" />
              <h4 className="text-sm font-semibold">{t('escrow.title')}</h4>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-8"
              onClick={() => setAddingHolding(true)}
            >
              <Plus className="size-4" /> {t('escrow.add')}
            </Button>
          </div>
          {escrowHoldings.length === 0 ? (
            <p className="text-xs text-muted-foreground">{t('escrow.empty')}</p>
          ) : (
            <div className="space-y-2">
              {escrowHoldings.map((h) => (
                <EscrowHoldingRow
                  key={h.id}
                  holding={h}
                  actions={actions}
                  onEdit={() => setEditingHolding(h)}
                  onRelease={() => setReleasingHolding(h)}
                />
              ))}
            </div>
          )}
        </div>
      </CardContent>

      {(addingLine || editingLine) && (
        <FundsFlowLineEditor
          actions={actions}
          parties={parties}
          line={editingLine}
          onClose={() => {
            setAddingLine(false);
            setEditingLine(null);
          }}
        />
      )}
      {(addingHolding || editingHolding) && (
        <EscrowEditor
          actions={actions}
          holding={editingHolding}
          onClose={() => {
            setAddingHolding(false);
            setEditingHolding(null);
          }}
        />
      )}
      {releasingHolding && (
        <EscrowReleaseEditor
          actions={actions}
          holding={releasingHolding}
          onClose={() => setReleasingHolding(null)}
        />
      )}
    </Card>
  );
}

function EscrowHoldingRow({
  holding,
  actions,
  onEdit,
  onRelease,
}: {
  holding: EscrowHolding;
  actions: FundsFlowActions;
  onEdit: () => void;
  onRelease: () => void;
}) {
  const t = useTranslations('deal.fundsFlow');
  const tDeal = useTranslations('deal');
  const statusVariant = holding.status === 'RELEASED' ? 'default' : 'secondary';
  return (
    <div className="rounded-lg border bg-[var(--surface-1)] p-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{holding.label}</span>
            <Badge variant={statusVariant}>{t(`escrowStatus.${holding.status}`)}</Badge>
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
            <span>{t('escrow.amount')}: {fmtMoney(holding.amount, holding.currency)}</span>
            <span>{t('escrow.released')}: {fmtMoney(holding.released, holding.currency)}</span>
            <span>{t('escrow.remaining')}: {fmtMoney(holding.remaining, holding.currency)}</span>
          </div>
          {(holding.agent || holding.releaseTrigger) && (
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {holding.agent && <span>{t('escrow.agent')}: {holding.agent}</span>}
              {holding.releaseTrigger && (
                <span>{t('escrow.trigger')}: {holding.releaseTrigger}</span>
              )}
            </div>
          )}
          {holding.releases.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-muted-foreground">
              {holding.releases.map((r) => (
                <li key={r.id} className="flex items-center gap-2">
                  <span>· {fmtMoney(r.amount, holding.currency)}</span>
                  {r.reason && <span className="truncate">— {r.reason}</span>}
                  <button
                    type="button"
                    className="text-[var(--danger)] hover:underline"
                    onClick={() => actions.removeRelease.mutate(r.id)}
                  >
                    {tDeal('delete')}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {holding.status !== 'RELEASED' && (
            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onRelease}>
              {t('escrow.release')}
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={onEdit}>
            {tDeal('edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            aria-label={tDeal('delete')}
            onClick={() => actions.removeHolding.mutate(holding.id)}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
    </div>
  );
}

function FundsFlowLineEditor({
  actions,
  parties,
  line,
  onClose,
}: {
  actions: FundsFlowActions;
  parties: DealParty[];
  line: DealFundsFlowLine | null;
  onClose: () => void;
}) {
  const t = useTranslations('deal.fundsFlow');
  const tDeal = useTranslations('deal');
  const [kind, setKind] = useState<FundsFlowKind>(line?.kind ?? 'PAYMENT');
  const [payerPartyId, setPayerPartyId] = useState(line?.payerPartyId ?? '');
  const [payeePartyId, setPayeePartyId] = useState(line?.payeePartyId ?? '');
  const [amount, setAmount] = useState(line?.amount ?? '');
  const [currency, setCurrency] = useState(line?.currency ?? 'EUR');
  const [account, setAccount] = useState(line?.account ?? '');
  const [condition, setCondition] = useState(line?.condition ?? '');
  const [status, setStatus] = useState<FundsFlowStatus>(line?.status ?? 'PLANNED');

  const pending = actions.addLine.isPending || actions.updateLine.isPending;
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount.trim());

  const save = () => {
    if (!validAmount) return;
    const body = {
      kind,
      payerPartyId,
      payeePartyId,
      amount: amount.trim(),
      currency: currency.trim().toUpperCase(),
      account,
      condition,
      status,
    };
    if (line) {
      actions.updateLine.mutate({ id: line.id, ...body }, { onSuccess: onClose });
    } else {
      actions.addLine.mutate(body, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{line ? t('editLine') : t('addLine')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ff-kind">{t('kindLabel')}</Label>
              <select
                id="ff-kind"
                value={kind}
                onChange={(e) => setKind(e.target.value as FundsFlowKind)}
                className={selectClass}
              >
                {FUNDS_FLOW_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {t(`kind.${k}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ff-status">{t('statusLabel')}</Label>
              <select
                id="ff-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as FundsFlowStatus)}
                className={selectClass}
              >
                {FUNDS_FLOW_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {t(`status.${s}`)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ff-payer">{t('payer')}</Label>
              <select
                id="ff-payer"
                value={payerPartyId}
                onChange={(e) => setPayerPartyId(e.target.value)}
                className={selectClass}
              >
                <option value="">{tDeal('none')}</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ff-payee">{t('payee')}</Label>
              <select
                id="ff-payee"
                value={payeePartyId}
                onChange={(e) => setPayeePartyId(e.target.value)}
                className={selectClass}
              >
                <option value="">{tDeal('none')}</option>
                {parties.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ff-amount">{t('amount')}</Label>
              <Input
                id="ff-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ff-currency">{t('currency')}</Label>
              <Input
                id="ff-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-account">{t('account')}</Label>
            <Input id="ff-account" value={account} onChange={(e) => setAccount(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ff-condition">{t('condition')}</Label>
            <Input
              id="ff-condition"
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tDeal('cancel')}
          </Button>
          <Button onClick={save} disabled={!validAmount || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {tDeal('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscrowEditor({
  actions,
  holding,
  onClose,
}: {
  actions: FundsFlowActions;
  holding: EscrowHolding | null;
  onClose: () => void;
}) {
  const t = useTranslations('deal.fundsFlow');
  const tDeal = useTranslations('deal');
  const [label, setLabel] = useState(holding?.label ?? '');
  const [amount, setAmount] = useState(holding?.amount ?? '');
  const [currency, setCurrency] = useState(holding?.currency ?? 'EUR');
  const [agent, setAgent] = useState(holding?.agent ?? '');
  const [releaseTrigger, setReleaseTrigger] = useState(holding?.releaseTrigger ?? '');
  const [notes, setNotes] = useState(holding?.notes ?? '');

  const pending = actions.addHolding.isPending || actions.updateHolding.isPending;
  const validAmount = /^\d+(\.\d{1,2})?$/.test(amount.trim());

  const save = () => {
    if (!label.trim() || !validAmount) return;
    const body = {
      label: label.trim(),
      amount: amount.trim(),
      currency: currency.trim().toUpperCase(),
      agent,
      releaseTrigger,
      notes,
    };
    if (holding) {
      actions.updateHolding.mutate({ id: holding.id, ...body }, { onSuccess: onClose });
    } else {
      actions.addHolding.mutate(body, { onSuccess: onClose });
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{holding ? t('escrow.editTitle') : t('escrow.addTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="es-label">{t('escrow.label')}</Label>
            <Input id="es-label" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="grid grid-cols-[1fr_7rem] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="es-amount">{t('escrow.amount')}</Label>
              <Input
                id="es-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="es-currency">{t('currency')}</Label>
              <Input
                id="es-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                maxLength={3}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-agent">{t('escrow.agent')}</Label>
            <Input id="es-agent" value={agent} onChange={(e) => setAgent(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-trigger">{t('escrow.trigger')}</Label>
            <Input
              id="es-trigger"
              value={releaseTrigger}
              onChange={(e) => setReleaseTrigger(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="es-notes">{tDeal('parties.notes')}</Label>
            <Textarea
              id="es-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tDeal('cancel')}
          </Button>
          <Button onClick={save} disabled={!label.trim() || !validAmount || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {tDeal('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EscrowReleaseEditor({
  actions,
  holding,
  onClose,
}: {
  actions: FundsFlowActions;
  holding: EscrowHolding;
  onClose: () => void;
}) {
  const t = useTranslations('deal.fundsFlow');
  const tDeal = useTranslations('deal');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const pending = actions.addRelease.isPending;
  const remaining = Number(holding.remaining);
  const validAmount =
    /^\d+(\.\d{1,2})?$/.test(amount.trim()) &&
    Number(amount) > 0 &&
    Number(amount) <= remaining + 1e-9;

  const save = () => {
    if (!validAmount) return;
    actions.addRelease.mutate(
      { holdingId: holding.id, amount: amount.trim(), reason },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('escrow.releaseTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <p className="text-xs text-muted-foreground">
            {t('escrow.remaining')}: {fmtMoney(holding.remaining, holding.currency)}
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="er-amount">{t('escrow.releaseAmount')}</Label>
            <Input
              id="er-amount"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="er-reason">{t('escrow.reason')}</Label>
            <Input id="er-reason" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {tDeal('cancel')}
          </Button>
          <Button onClick={save} disabled={!validAmount || pending}>
            {pending && <Loader2 className="size-4 animate-spin" />}
            {t('escrow.confirmRelease')}
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

// Hito → fase de gating cuyas condiciones previas deben estar satisfechas antes de marcarlo DONE.
const MILESTONE_GATING_PHASE: Partial<Record<DealMilestoneKind, 'AT_SIGNING' | 'AT_CLOSING'>> = {
  SIGNING: 'AT_SIGNING',
  CLOSING: 'AT_CLOSING',
};

function MilestonesCard({
  matterId,
  milestones,
  actions,
}: {
  matterId: string;
  milestones: DealMilestone[];
  actions: Actions;
}) {
  const t = useTranslations('deal');
  const tStatus = useTranslations('deal.milestoneStatus');
  const locale = useLocale();
  const { data: readiness } = useMatterReadiness(matterId);
  const [editing, setEditing] = useState<DealMilestone | null>(null);
  const [adding, setAdding] = useState(false);

  const sorted = useMemo(
    () =>
      [...milestones].sort(
        (a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime(),
      ),
    [milestones],
  );

  // Aviso (no bloqueo duro) al marcar un hito de firma/cierre como DONE con CPs pendientes: el usuario
  // confirma explícitamente. Por defecto, si no hay datos de readiness o no quedan pendientes, no molesta.
  const changeStatus = (m: DealMilestone, status: DealMilestoneStatus) => {
    if (status === 'DONE') {
      const phase = MILESTONE_GATING_PHASE[m.kind];
      const pr = phase ? readiness?.byPhase.find((p) => p.phase === phase) : undefined;
      if (pr && pr.pending > 0) {
        const ok = window.confirm(
          t('milestones.pendingConditionsWarning', {
            count: pr.pending,
            titles: pr.pendingTitles.join(', '),
          }),
        );
        if (!ok) return;
      }
    }
    actions.updateMilestone.mutate({ id: m.id, status });
  };

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
                  onChange={(e) => changeStatus(m, e.target.value as DealMilestoneStatus)}
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
