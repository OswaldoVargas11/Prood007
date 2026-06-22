'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BookText, Loader2, Plus, ScrollText, Trash2, Users } from 'lucide-react';
import { useCompanySecretary, useCompanySecretaryActions } from '@/lib/hooks';
import { formatDate } from '@/lib/format';
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

const inputClass = 'h-9';

export function CompanySecretaryTab({ clientId }: { clientId: string }) {
  const t = useTranslations('companySecretary');
  const { data, isLoading } = useCompanySecretary(clientId);
  const actions = useCompanySecretaryActions(clientId);
  const locale = useLocale();

  if (isLoading || !data) return <Skeleton className="h-64 w-full" />;

  return (
    <div className="space-y-6">
      {/* Libro de socios */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <Users className="size-4 text-[var(--brand)]" />
          <h3 className="text-sm font-semibold">{t('shareholders')}</h3>
          <span className="text-xs text-muted-foreground">
            {t('totalUnits', { units: data.totalUnits })}
          </span>
        </div>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {data.shareholders.map((s) => (
              <div key={s.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.taxId && (
                  <span className="hidden text-xs text-muted-foreground sm:inline">{s.taxId}</span>
                )}
                <span className="tabular-nums">{s.units}</span>
                {data.totalUnits > 0 && (
                  <Badge variant="outline">{Math.round((s.units / data.totalUnits) * 100)}%</Badge>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.removeShareholder.mutate(s.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {data.shareholders.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                {t('noShareholders')}
              </div>
            )}
          </CardContent>
        </Card>
        <AddShareholder actions={actions} />
        <TransfersBlock data={data} actions={actions} locale={locale} />
      </section>

      {/* Libro de actas */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <BookText className="size-4 text-[var(--brand)]" />
          <h3 className="text-sm font-semibold">{t('minutes')}</h3>
        </div>
        <div className="space-y-2">
          {data.minutes.map((m) => (
            <Card key={m.id}>
              <CardContent className="space-y-1 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="secondary">{t(`kind.${m.kind}`)}</Badge>
                  <span className="font-medium">{m.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(m.meetingDate, locale)}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="ml-auto"
                    onClick={() => actions.removeMinute.mutate(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
                <p className="whitespace-pre-wrap text-xs text-muted-foreground">{m.body}</p>
              </CardContent>
            </Card>
          ))}
          {data.minutes.length === 0 && (
            <p className="text-xs text-muted-foreground">{t('noMinutes')}</p>
          )}
        </div>
        <AddMinute actions={actions} />
      </section>

      {/* Obligaciones registrales */}
      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <ScrollText className="size-4 text-[var(--brand)]" />
          <h3 className="text-sm font-semibold">{t('obligations')}</h3>
        </div>
        <Card>
          <CardContent className="divide-y divide-border p-0">
            {data.obligations.map((o) => (
              <div key={o.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{o.title}</span>
                <span className="text-xs text-muted-foreground">
                  {formatDate(o.dueDate, locale)}
                </span>
                {o.recurrence === 'ANNUAL' && <Badge variant="outline">{t('annual')}</Badge>}
                {o.status === 'FILED' ? (
                  <Badge>{t('filed')}</Badge>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7"
                    onClick={() => actions.updateObligation.mutate({ id: o.id, status: 'FILED' })}
                  >
                    {t('markFiled')}
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => actions.removeObligation.mutate(o.id)}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            ))}
            {data.obligations.length === 0 && (
              <div className="px-4 py-6 text-center text-xs text-muted-foreground">
                {t('noObligations')}
              </div>
            )}
          </CardContent>
        </Card>
        <AddObligation actions={actions} />
      </section>
    </div>
  );
}

type Actions = ReturnType<typeof useCompanySecretaryActions>;

function AddShareholder({ actions }: { actions: Actions }) {
  const t = useTranslations('companySecretary');
  const [name, setName] = useState('');
  const [taxId, setTaxId] = useState('');
  const [units, setUnits] = useState('');
  const submit = () => {
    if (!name.trim()) return;
    actions.addShareholder.mutate(
      { name: name.trim(), taxId: taxId.trim() || undefined, units: Number(units) || 0 },
      {
        onSuccess: () => {
          setName('');
          setTaxId('');
          setUnits('');
        },
      },
    );
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        className={`${inputClass} flex-1`}
        placeholder={t('shName')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <Input
        className={`${inputClass} w-32`}
        placeholder={t('shTaxId')}
        value={taxId}
        onChange={(e) => setTaxId(e.target.value)}
      />
      <Input
        className={`${inputClass} w-24`}
        inputMode="numeric"
        placeholder={t('shUnits')}
        value={units}
        onChange={(e) => setUnits(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-9 shrink-0"
        disabled={!name.trim() || actions.addShareholder.isPending}
        onClick={submit}
      >
        <Plus className="size-4" /> {t('add')}
      </Button>
    </div>
  );
}

function TransfersBlock({
  data,
  actions,
  locale,
}: {
  data: {
    transfers: {
      id: string;
      fromName: string | null;
      toName: string;
      units: number;
      date: string;
    }[];
  };
  actions: Actions;
  locale: string;
}) {
  const t = useTranslations('companySecretary');
  const [open, setOpen] = useState(false);
  const [fromName, setFromName] = useState('');
  const [toName, setToName] = useState('');
  const [units, setUnits] = useState('');
  const [date, setDate] = useState('');

  return (
    <div className="space-y-2 pt-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{t('transfers')}</span>
        <Button size="sm" variant="ghost" className="h-7" onClick={() => setOpen(true)}>
          <Plus className="size-3.5" /> {t('addTransfer')}
        </Button>
      </div>
      {data.transfers.length > 0 && (
        <div className="space-y-1 text-xs text-muted-foreground">
          {data.transfers.map((tr) => (
            <div key={tr.id} className="flex items-center gap-2">
              <span>{formatDate(tr.date, locale)}</span>
              <span>·</span>
              <span>
                {tr.fromName ? `${tr.fromName} → ${tr.toName}` : `${t('issuance')} → ${tr.toName}`}{' '}
                ({tr.units})
              </span>
              <button className="ml-auto" onClick={() => actions.removeTransfer.mutate(tr.id)}>
                <Trash2 className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addTransfer')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tr-from">{t('trFrom')}</Label>
              <Input
                id="tr-from"
                placeholder={t('trFromPlaceholder')}
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tr-to">{t('trTo')}</Label>
              <Input id="tr-to" value={toName} onChange={(e) => setToName(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tr-units">{t('trUnits')}</Label>
                <Input
                  id="tr-units"
                  inputMode="numeric"
                  value={units}
                  onChange={(e) => setUnits(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tr-date">{t('trDate')}</Label>
                <Input
                  id="tr-date"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={!toName.trim() || !units || !date || actions.addTransfer.isPending}
              onClick={() =>
                actions.addTransfer.mutate(
                  {
                    fromName: fromName.trim() || undefined,
                    toName: toName.trim(),
                    units: Number(units),
                    date,
                  },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setFromName('');
                      setToName('');
                      setUnits('');
                      setDate('');
                    },
                  },
                )
              }
            >
              {actions.addTransfer.isPending && <Loader2 className="size-4 animate-spin" />}
              {t('register')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AddMinute({ actions }: { actions: Actions }) {
  const t = useTranslations('companySecretary');
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState('GENERAL_MEETING');
  const [title, setTitle] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [body, setBody] = useState('');

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t('addMinute')}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('addMinute')}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="m-kind">{t('mKind')}</Label>
                <select
                  id="m-kind"
                  value={kind}
                  onChange={(e) => setKind(e.target.value)}
                  className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm"
                >
                  <option value="GENERAL_MEETING">{t('kind.GENERAL_MEETING')}</option>
                  <option value="BOARD">{t('kind.BOARD')}</option>
                  <option value="OTHER">{t('kind.OTHER')}</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="m-date">{t('mDate')}</Label>
                <Input
                  id="m-date"
                  type="date"
                  value={meetingDate}
                  onChange={(e) => setMeetingDate(e.target.value)}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-title">{t('mTitle')}</Label>
              <Input id="m-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="m-body">{t('mBody')}</Label>
              <Textarea
                id="m-body"
                rows={4}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={t('mBodyPlaceholder')}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              {t('cancel')}
            </Button>
            <Button
              disabled={
                !title.trim() || !meetingDate || !body.trim() || actions.addMinute.isPending
              }
              onClick={() =>
                actions.addMinute.mutate(
                  { kind, title: title.trim(), meetingDate, body: body.trim() },
                  {
                    onSuccess: () => {
                      setOpen(false);
                      setTitle('');
                      setMeetingDate('');
                      setBody('');
                    },
                  },
                )
              }
            >
              {actions.addMinute.isPending && <Loader2 className="size-4 animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddObligation({ actions }: { actions: Actions }) {
  const t = useTranslations('companySecretary');
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const submit = () => {
    if (!title.trim() || !dueDate) return;
    actions.addObligation.mutate(
      { title: title.trim(), dueDate, recurrence: 'ANNUAL' },
      {
        onSuccess: () => {
          setTitle('');
          setDueDate('');
        },
      },
    );
  };
  return (
    <div className="flex flex-wrap gap-2">
      <Input
        className={`${inputClass} flex-1`}
        placeholder={t('obTitle')}
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <Input
        className={`${inputClass} w-40`}
        type="date"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
      />
      <Button
        size="sm"
        variant="outline"
        className="h-9 shrink-0"
        disabled={!title.trim() || !dueDate || actions.addObligation.isPending}
        onClick={submit}
      >
        <Plus className="size-4" /> {t('add')}
      </Button>
    </div>
  );
}
