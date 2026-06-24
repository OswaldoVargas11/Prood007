'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Circle, ListChecks, Loader2, MinusCircle, Plus, Trash2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import {
  useApplyPresentationChecklist,
  useMatterDocuments,
  usePresentationChecklists,
  usePresentationTypes,
  useRemovePresentationChecklist,
  useUpdatePresentationItem,
} from '@/lib/hooks';
import type { ChecklistItemStatus } from '@/lib/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

const STATUS_ICON: Record<ChecklistItemStatus, typeof Circle> = {
  PENDING: Circle,
  UPLOADED: CheckCircle2,
  NA: MinusCircle,
};

export function ChecklistTab({ matterId }: { matterId: string }) {
  const t = useTranslations('checklist');
  const { data: checklists, isLoading } = usePresentationChecklists(matterId);
  const { data: types } = usePresentationTypes();
  const { data: documents } = useMatterDocuments(matterId);
  const apply = useApplyPresentationChecklist(matterId);
  const updateItem = useUpdatePresentationItem(matterId);
  const removeChecklist = useRemovePresentationChecklist(matterId);
  const [typeToApply, setTypeToApply] = useState('');

  if (isLoading) return <Skeleton className="h-64 w-full rounded-xl" />;

  return (
    <div className="space-y-4">
      {/* Aplicar un tipo de presentación */}
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 p-4">
          <div className="min-w-[220px] flex-1 space-y-1">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t('applyLabel')}
            </label>
            <select
              value={typeToApply}
              onChange={(e) => setTypeToApply(e.target.value)}
              className="flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">{t('applyPlaceholder')}</option>
              {(types ?? []).map((ty) => (
                <option key={ty.id} value={ty.id}>
                  {ty.sector} · {ty.name}
                </option>
              ))}
            </select>
          </div>
          <Button
            size="sm"
            disabled={!typeToApply || apply.isPending}
            onClick={() => apply.mutate(typeToApply, { onSuccess: () => setTypeToApply('') })}
          >
            {apply.isPending ? <Loader2 className="animate-spin" /> : <Plus className="size-4" />}
            {t('apply')}
          </Button>
          {(types ?? []).length === 0 && (
            <p className="w-full text-[12px] text-muted-foreground">
              {t('noTypes')}{' '}
              <Link
                href="/presentations"
                className="font-medium text-[var(--brand)] hover:underline"
              >
                {t('manageCatalog')} →
              </Link>
            </p>
          )}
        </CardContent>
      </Card>

      {(checklists ?? []).length === 0 && (
        <div className="rounded-xl border bg-card p-12 text-center text-sm text-muted-foreground">
          <ListChecks className="mx-auto mb-2 size-6" />
          {t('empty')}
        </div>
      )}

      {(checklists ?? []).map((cl) => (
        <Card key={cl.id}>
          <CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{cl.title}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-40 overflow-hidden rounded-full bg-[var(--surface-2)]">
                    <div
                      className="h-full rounded-full bg-[var(--brand)] transition-all"
                      style={{ width: `${cl.progress.percent}%` }}
                    />
                  </div>
                  <span className="text-[12px] text-muted-foreground">
                    {t('progress', { done: cl.progress.done, total: cl.progress.total })}
                  </span>
                </div>
              </div>
              <Button
                size="icon"
                variant="ghost"
                className="size-7"
                aria-label={t('removeChecklist')}
                disabled={removeChecklist.isPending}
                onClick={() => removeChecklist.mutate(cl.id)}
              >
                <Trash2 className="size-4 text-[var(--danger)]" />
              </Button>
            </div>

            <ul className="divide-y">
              {cl.items.map((item) => {
                const Icon = STATUS_ICON[item.status];
                return (
                  <li key={item.id} className="flex flex-wrap items-center gap-2 py-2">
                    <Icon
                      className={cn(
                        'size-4 shrink-0',
                        item.status === 'UPLOADED'
                          ? 'text-[var(--success)]'
                          : item.status === 'NA'
                            ? 'text-muted-foreground'
                            : 'text-[var(--text-subtle)]',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <span className="text-[13px]">{item.name}</span>
                      {item.required && (
                        <span className="ml-1.5 text-[10px] font-semibold uppercase text-[var(--danger)]">
                          {t('required')}
                        </span>
                      )}
                      {item.description && (
                        <div className="text-[11.5px] text-muted-foreground">
                          {item.description}
                        </div>
                      )}
                    </div>
                    {/* Documento aportado */}
                    <select
                      value={item.documentId ?? ''}
                      onChange={(e) =>
                        updateItem.mutate({
                          itemId: item.id,
                          documentId: e.target.value === '' ? null : e.target.value,
                        })
                      }
                      aria-label={t('linkDoc')}
                      className="h-8 max-w-[170px] rounded-md border bg-[var(--surface-1)] px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="">{t('noDoc')}</option>
                      {(documents ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                    {/* Estado */}
                    <select
                      value={item.status}
                      onChange={(e) =>
                        updateItem.mutate({
                          itemId: item.id,
                          status: e.target.value as ChecklistItemStatus,
                        })
                      }
                      aria-label={t('statusLabel')}
                      className="h-8 rounded-md border bg-[var(--surface-1)] px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <option value="PENDING">{t('status.PENDING')}</option>
                      <option value="UPLOADED">{t('status.UPLOADED')}</option>
                      <option value="NA">{t('status.NA')}</option>
                    </select>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
