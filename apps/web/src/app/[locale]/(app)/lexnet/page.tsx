'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Gavel, Loader2, Plug, Trash2 } from 'lucide-react';
import {
  useChainDeadline,
  useCreateJudicialNotification,
  useDeleteJudicialNotification,
  useJudicialNotifications,
  useLexnetConnector,
  useMatters,
  type JudicialNotification,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';

export default function LexnetPage() {
  const t = useTranslations('lexnet');
  const connector = useLexnetConnector();
  const list = useJudicialNotifications();

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-2">
        <Gavel className="size-5 text-[var(--brand)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
          <p className="text-sm text-muted-foreground">{t('subtitle')}</p>
        </div>
      </div>

      <div className="flex items-start gap-3 rounded-xl border border-dashed bg-[var(--surface-1)] p-3.5">
        <Plug className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
        <div className="text-[12.5px]">
          <span className="font-medium">
            {connector.data?.enabled ? t('connector.active') : t('connector.inactive')}
          </span>
          <p className="text-muted-foreground">{t('connector.inactiveHint')}</p>
        </div>
      </div>

      <RegisterCard />

      <section className="space-y-3">
        <h2 className="text-sm font-medium text-muted-foreground">{t('list')}</h2>
        {list.isLoading && <Skeleton className="h-24 w-full" />}
        {list.data?.length === 0 && (
          <Card>
            <CardContent className="py-10 text-center text-sm text-muted-foreground">
              {t('empty')}
            </CardContent>
          </Card>
        )}
        <div className="space-y-2">
          {list.data?.map((n) => (
            <NotificationRow key={n.id} notif={n} />
          ))}
        </div>
      </section>
    </div>
  );
}

function RegisterCard() {
  const t = useTranslations('lexnet');
  const create = useCreateJudicialNotification();
  const matters = useMatters({ pageSize: 100 });
  const [subject, setSubject] = useState('');
  const [court, setCourt] = useState('');
  const [procedureRef, setProcedureRef] = useState('');
  const [type, setType] = useState('');
  const [matterId, setMatterId] = useState('');
  const [receivedAt, setReceivedAt] = useState('');

  async function submit() {
    if (!subject.trim() || !receivedAt) return;
    try {
      await create.mutateAsync({
        subject: subject.trim(),
        court: court.trim() || undefined,
        procedureRef: procedureRef.trim() || undefined,
        type: type.trim() || undefined,
        matterId: matterId || undefined,
        receivedAt,
      });
      toast.success(t('saved'));
      setSubject('');
      setCourt('');
      setProcedureRef('');
      setType('');
      setMatterId('');
      setReceivedAt('');
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveError'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('register')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground">{t('subject')}</label>
          <Input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder={t('subjectPlaceholder')}
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('court')}</label>
            <Input
              value={court}
              onChange={(e) => setCourt(e.target.value)}
              placeholder={t('courtPlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('procedureRef')}</label>
            <Input
              value={procedureRef}
              onChange={(e) => setProcedureRef(e.target.value)}
              placeholder={t('procedureRefPlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('type')}</label>
            <Input
              value={type}
              onChange={(e) => setType(e.target.value)}
              placeholder={t('typePlaceholder')}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('matter')}</label>
            <select
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t('noMatter')}</option>
              {matters.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.reference} — {m.title}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('receivedAt')}</label>
            <input
              type="date"
              value={receivedAt}
              onChange={(e) => setReceivedAt(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
        </div>
        <Button onClick={submit} disabled={create.isPending || !subject.trim() || !receivedAt}>
          {create.isPending && <Loader2 className="size-4 animate-spin" />}
          {t('save')}
        </Button>
      </CardContent>
    </Card>
  );
}

function NotificationRow({ notif }: { notif: JudicialNotification }) {
  const t = useTranslations('lexnet');
  const chain = useChainDeadline();
  const del = useDeleteJudicialNotification();
  const [open, setOpen] = useState(false);
  const [deadlineType, setDeadlineType] = useState('');
  const [days, setDays] = useState<number>(20);

  const received = new Date(notif.receivedAt).toLocaleDateString('es-ES');

  async function compute() {
    if (!deadlineType.trim()) return;
    try {
      await chain.mutateAsync({ id: notif.id, deadlineType: deadlineType.trim(), days });
      toast.success(t('computed'));
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('computeError'));
    }
  }

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">{notif.subject}</span>
              {notif.taskId ? (
                <Badge variant="success">{t('deadlineDone')}</Badge>
              ) : (
                <Badge variant="warning">{t('deadlinePending')}</Badge>
              )}
            </div>
            <div className="text-[12.5px] text-muted-foreground">
              {t('receivedOn', { date: received })}
              {notif.court ? ` · ${notif.court}` : ''}
              {notif.procedureRef ? ` · ${notif.procedureRef}` : ''}
              {notif.matter ? ` · ${notif.matter.reference}` : ''}
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            {!notif.taskId && (
              <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
                {t('computeDeadline')}
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => del.mutate(notif.id)}
              disabled={del.isPending}
              aria-label={t('delete')}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {open && !notif.taskId && (
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed bg-[var(--surface-1)] p-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                {t('deadlineType')}
              </label>
              <Input
                value={deadlineType}
                onChange={(e) => setDeadlineType(e.target.value)}
                placeholder={t('deadlineTypePlaceholder')}
                list="deadline-presets"
                className="h-8 w-48"
              />
              <datalist id="deadline-presets">
                <option value="Recurso de reposición" />
                <option value="Recurso de apelación" />
                <option value="Contestación a la demanda" />
                <option value="Recurso de casación" />
              </datalist>
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">{t('days')}</label>
              <Input
                type="number"
                min={1}
                max={365}
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="h-8 w-20"
              />
            </div>
            <Button size="sm" onClick={compute} disabled={chain.isPending || !deadlineType.trim()}>
              {chain.isPending && <Loader2 className="size-4 animate-spin" />}
              {t('compute')}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
