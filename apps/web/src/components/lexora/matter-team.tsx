'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Loader2, Star, UserPlus, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { useAddAssignee, useAssignees, useMatterTeam, useRemoveAssignee } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

/**
 * Equipo del expediente: letrado responsable/líder (gestionado en la ficha de Resumen) + letrados
 * adicionales asignados. El administrador puede añadir/quitar colaboradores. La participación en el
 * chat por expediente se restringe a este equipo + el cliente.
 */
export function MatterTeamCard({ matterId }: { matterId: string }) {
  const t = useTranslations('matters.team');
  const { hasRole } = useAuth();
  const isAdmin = hasRole('FIRM_ADMIN');
  const { data: team, isLoading } = useMatterTeam(matterId);
  const assignees = useAssignees(isAdmin);
  const add = useAddAssignee(matterId);
  const remove = useRemoveAssignee(matterId);
  const [selected, setSelected] = useState('');

  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Skeleton className="h-20 w-full" />
        </CardContent>
      </Card>
    );
  }

  const lead = team?.lead ?? null;
  const members = team?.members ?? [];
  // Letrados que se pueden añadir: ni el líder ni los ya miembros.
  const takenIds = new Set([lead?.id, ...members.map((m) => m.id)].filter(Boolean) as string[]);
  const addable = (assignees.data ?? []).filter((a) => !takenIds.has(a.id));

  function submitAdd() {
    if (!selected) return;
    add.mutate(selected, { onSuccess: () => setSelected('') });
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Líder */}
        <div className="flex items-center gap-2">
          <span className="flex size-7 items-center justify-center rounded-full bg-[var(--brand-soft)] text-[var(--brand)]">
            <Star className="size-3.5 fill-current" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
              {t('lead')}
            </div>
            <div className="truncate text-sm font-medium">{lead?.fullName ?? t('noLead')}</div>
          </div>
        </div>

        {/* Letrados adicionales */}
        {members.length > 0 ? (
          <ul className="space-y-1.5">
            {members.map((m) => (
              <li
                key={m.id}
                className="flex items-center gap-2 rounded-md bg-[var(--surface-2)] px-2.5 py-1.5"
              >
                <span className="truncate text-sm">{m.fullName}</span>
                {isAdmin && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="ml-auto size-6 shrink-0"
                    disabled={remove.isPending}
                    aria-label={t('remove')}
                    onClick={() => remove.mutate(m.id)}
                  >
                    <X className="size-3.5" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">{t('noMembers')}</p>
        )}

        {/* Añadir (solo admin) */}
        {isAdmin && (
          <div className="flex items-center gap-2 pt-1">
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              disabled={add.isPending || assignees.isLoading || addable.length === 0}
              className="flex h-9 flex-1 rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
            >
              <option value="">
                {addable.length === 0 ? t('allAssigned') : t('addPlaceholder')}
              </option>
              {addable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.fullName}
                </option>
              ))}
            </select>
            <Button size="sm" disabled={!selected || add.isPending} onClick={submitAdd}>
              {add.isPending ? (
                <Loader2 className="animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {t('add')}
            </Button>
          </div>
        )}
        {(add.isError || remove.isError) && (
          <p className="text-[11px] text-[var(--danger)]">{t('error')}</p>
        )}
      </CardContent>
    </Card>
  );
}
