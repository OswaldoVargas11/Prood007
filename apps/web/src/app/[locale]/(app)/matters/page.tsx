'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { LayoutGrid, Loader2, Plus, Rows3 } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import { useAuth } from '@/lib/auth';
import {
  useAssignees,
  useClients,
  useCreateMatter,
  useMatters,
  useSetMatterStatus,
} from '@/lib/hooks';
import { MATTER_STATUSES, MATTER_TRANSITIONS } from '@/lib/matter-status';
import { formatDate } from '@/lib/format';
import { ApiError } from '@/lib/api';
import type { Matter, MatterStatus } from '@/lib/types';
import { StatusBadge } from '@/components/lexora/status-badge';
import {
  MatterPartiesFields,
  emptyParties,
  partiesToBody,
  type PartiesValue,
} from '@/components/lexora/matter-parties';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
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
import { cn } from '@/lib/utils';

const PAGE_SIZE = 20;

export default function MattersPage() {
  const t = useTranslations('matters');
  const tStatus = useTranslations('matters.status');
  const locale = useLocale();
  const [status, setStatus] = useState<MatterStatus | undefined>(undefined);
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<'table' | 'board'>('table');

  // En tablero mostramos todos los expedientes agrupados por estado (sin filtro ni paginación).
  const { data, isLoading, isError, refetch, isFetching } = useMatters(
    view === 'board' ? { page: 1, pageSize: 100 } : { page, pageSize: PAGE_SIZE, status },
  );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;

  function pick(s: MatterStatus | undefined) {
    setStatus(s);
    setPage(1);
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        eyebrow={
          data ? `${data.total} ${data.total === 1 ? 'expediente' : 'expedientes'}` : undefined
        }
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <>
            {/* Conmutador tabla / tablero */}
            <div className="flex rounded-lg border p-0.5">
              <button
                type="button"
                onClick={() => setView('table')}
                aria-label={t('viewTable')}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  view === 'table'
                    ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <Rows3 className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setView('board')}
                aria-label={t('viewBoard')}
                className={cn(
                  'flex size-7 items-center justify-center rounded-md transition-colors',
                  view === 'board'
                    ? 'bg-[var(--brand-soft)] text-[var(--brand)]'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="size-4" />
              </button>
            </div>
            <Button size="sm" onClick={() => setCreating(true)}>
              <Plus /> {t('new')}
            </Button>
          </>
        }
      />
      <CreateMatterDialog open={creating} onClose={() => setCreating(false)} />

      {/* Filtro por estado (solo en vista de tabla) */}
      {view === 'table' && (
        <div className="flex flex-wrap gap-1.5">
          <FilterChip active={status === undefined} onClick={() => pick(undefined)}>
            {t('filterAll')}
          </FilterChip>
          {MATTER_STATUSES.map((s) => (
            <FilterChip key={s} active={status === s} onClick={() => pick(s)}>
              {tStatus(s)}
            </FilterChip>
          ))}
        </div>
      )}

      {view === 'board' && (
        <MatterBoard
          items={data?.items ?? []}
          loading={isLoading}
          tStatus={tStatus}
          locale={locale}
        />
      )}

      {view === 'table' && (
        <Card className="overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('col.reference')}</th>
                <th className="px-4 py-3 font-medium">{t('col.title')}</th>
                <th className="px-4 py-3 font-medium">{t('col.client')}</th>
                <th className="px-4 py-3 font-medium">{t('col.lawyer')}</th>
                <th className="px-4 py-3 font-medium">{t('col.status')}</th>
                <th className="px-4 py-3 font-medium">{t('col.updated')}</th>
              </tr>
            </thead>
            <tbody>
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-5 w-full" />
                    </td>
                  </tr>
                ))}

              {!isLoading &&
                !isError &&
                data?.items.map((m) => (
                  <tr
                    key={m.id}
                    className="border-b border-border transition-colors last:border-0 hover:bg-accent"
                  >
                    <td className="px-4 py-3 font-mono text-xs">
                      <Link
                        href={`/matters/${m.id}`}
                        className="font-medium text-[var(--brand)] hover:underline"
                      >
                        {m.reference}
                      </Link>
                    </td>
                    <td className="px-4 py-3">
                      <Link href={`/matters/${m.id}`} className="hover:underline">
                        {m.title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.client?.name ?? '—'}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.lawyer?.fullName ?? '—'}</td>
                    <td className="px-4 py-3">
                      <StatusBadge status={m.status} />
                    </td>
                    <td className="px-4 py-3 tabular-nums text-muted-foreground">
                      {formatDate(m.updatedAt, locale)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>

          {isError && (
            <div className="space-y-2 p-8 text-center">
              <p className="text-sm text-[var(--danger)]">{t('loadError')}</p>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isFetching}>
                {t('retry')}
              </Button>
            </div>
          )}

          {!isLoading && !isError && data?.items.length === 0 && (
            <div className="flex flex-col items-center gap-3 p-12 text-center text-sm text-muted-foreground">
              {t('empty')}
              <Button size="sm" onClick={() => setCreating(true)}>
                <Plus /> {t('emptyCta')}
              </Button>
            </div>
          )}
        </Card>
      )}

      {view === 'table' && !isError && data && data.total > 0 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span className="tabular-nums">{t('pageOf', { page, pages: totalPages })}</span>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              {t('prev')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function MatterBoard({
  items,
  loading,
  tStatus,
  locale,
}: {
  items: Matter[];
  loading: boolean;
  tStatus: ReturnType<typeof useTranslations>;
  locale: string;
}) {
  const setStatus = useSetMatterStatus();
  // Tarjeta que se arrastra (id + estado origen) para validar transiciones al sobrevolar columnas.
  const [drag, setDrag] = useState<{ id: string; from: MatterStatus } | null>(null);
  const [over, setOver] = useState<MatterStatus | null>(null);

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        {MATTER_STATUSES.map((s) => (
          <Skeleton key={s} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  // ¿Se puede soltar la tarjeta arrastrada en la columna `to`? (transición válida y distinta).
  const canDrop = (to: MatterStatus) =>
    drag !== null && drag.from !== to && (MATTER_TRANSITIONS[drag.from] ?? []).includes(to);

  return (
    <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-3 xl:grid-cols-5">
      {MATTER_STATUSES.map((s) => {
        const col = items.filter((m) => m.status === s);
        const droppable = canDrop(s);
        return (
          <div
            key={s}
            onDragOver={(e) => {
              if (droppable) {
                e.preventDefault();
                setOver(s);
              }
            }}
            onDragLeave={() => setOver((o) => (o === s ? null : o))}
            onDrop={(e) => {
              e.preventDefault();
              if (drag && droppable) setStatus.mutate({ id: drag.id, status: s });
              setDrag(null);
              setOver(null);
            }}
            className={cn(
              'rounded-xl border bg-card/50 transition-colors',
              over === s && droppable && 'border-[var(--brand)] bg-[var(--brand-soft)]',
              drag && droppable && over !== s && 'border-dashed border-[var(--brand-line)]',
            )}
          >
            <div className="flex items-center justify-between border-b px-3 py-2.5">
              <StatusBadge status={s} />
              <span className="text-[11px] font-semibold tabular-nums text-[var(--text-subtle)]">
                {col.length}
              </span>
            </div>
            <div className="flex flex-col gap-2 p-2">
              {col.length === 0 && (
                <p className="px-1 py-3 text-center text-[11px] text-[var(--text-subtle)]">—</p>
              )}
              {col.map((m) => (
                <Link
                  key={m.id}
                  href={`/matters/${m.id}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = 'move';
                    setDrag({ id: m.id, from: m.status });
                  }}
                  onDragEnd={() => {
                    setDrag(null);
                    setOver(null);
                  }}
                  className="block cursor-grab rounded-lg border bg-card p-2.5 shadow-sm transition-colors hover:border-[var(--brand-line)] active:cursor-grabbing"
                >
                  <div className="font-mono text-[10.5px] text-[var(--text-subtle)]">
                    {m.reference}
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[12.5px] font-medium leading-snug">
                    {m.title}
                  </div>
                  <div className="mt-1.5 flex items-center justify-between gap-2 text-[10.5px] text-muted-foreground">
                    <span className="truncate">{m.client?.name ?? '—'}</span>
                    <span className="shrink-0 tabular-nums">{formatDate(m.updatedAt, locale)}</span>
                  </div>
                  {m.lawyer?.fullName && (
                    <div className="mt-1 truncate text-[10.5px] text-[var(--text-subtle)]">
                      {m.lawyer.fullName}
                    </div>
                  )}
                </Link>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateMatterDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('matters');
  const { hasRole } = useAuth();
  const isAdmin = hasRole('FIRM_ADMIN');
  const create = useCreateMatter();
  const router = useRouter();
  const clients = useClients({ pageSize: 100 });
  // El listado de letrados solo lo puede leer el administrador (es quien asigna).
  const assignees = useAssignees(isAdmin);
  const [title, setTitle] = useState('');
  const [type, setType] = useState('civil');
  const [clientId, setClientId] = useState('');
  const [lawyerId, setLawyerId] = useState('');
  const [parties, setParties] = useState<PartiesValue>(emptyParties);
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 2 && type.trim().length >= 2 && clientId;

  async function submit() {
    setError(null);
    try {
      const matter = await create.mutateAsync({
        title: title.trim(),
        type: type.trim(),
        clientId,
        ...(isAdmin && lawyerId ? { lawyerId } : {}),
        ...partiesToBody(parties),
      });
      setTitle('');
      setType('civil');
      setClientId('');
      setLawyerId('');
      setParties(emptyParties);
      onClose();
      router.push(`/matters/${matter.id}`);
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
              <Label>{t('newClient')}</Label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">{t('newClientPlaceholder')}</option>
                {clients.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} · {c.taxId}
                  </option>
                ))}
              </select>
              {clients.data?.items.length === 0 && (
                <p className="text-[11px] text-[var(--warning)]">{t('newNoClients')}</p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t('col.title')}</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
            </div>
            <div className="space-y-1.5">
              <Label>{t('col.type')}</Label>
              <Input value={type} onChange={(e) => setType(e.target.value)} placeholder="civil" />
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                <Label>{t('newLawyer')}</Label>
                <select
                  value={lawyerId}
                  onChange={(e) => setLawyerId(e.target.value)}
                  className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value="">{t('newLawyerPlaceholder')}</option>
                  {assignees.data?.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.fullName}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <MatterPartiesFields
              value={parties}
              onChange={(p) => setParties((s) => ({ ...s, ...p }))}
            />
            {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
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

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'rounded-full border px-3 py-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        active
          ? 'border-transparent bg-[var(--brand-soft)] text-[var(--brand)]'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}
