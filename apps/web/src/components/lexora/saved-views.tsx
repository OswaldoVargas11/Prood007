'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Bookmark, X } from 'lucide-react';
import { useCreateSavedView, useDeleteSavedView, useSavedViews } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Barra de vistas guardadas (presets de filtros) reutilizable por ámbito (facturas/tareas/expedientes).
 * `current` = el estado de filtros actual del listado; `onApply` lo restaura al pulsar una vista.
 */
export function SavedViews({
  scope,
  current,
  onApply,
}: {
  scope: string;
  current: Record<string, unknown>;
  onApply: (filters: Record<string, unknown>) => void;
}) {
  const t = useTranslations('savedViews');
  const { data: views } = useSavedViews(scope);
  const create = useCreateSavedView();
  const del = useDeleteSavedView(scope);
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  async function save() {
    if (!name.trim()) return;
    await create.mutateAsync({ scope, name: name.trim(), filters: current });
    setName('');
    setNaming(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {views?.map((v) => (
        <span
          key={v.id}
          className="group inline-flex items-center gap-1 rounded-full border border-border bg-[var(--surface-1)] px-2.5 py-1 text-xs"
        >
          <button
            type="button"
            className="hover:text-[var(--brand)]"
            onClick={() => onApply(v.filters)}
          >
            {v.name}
          </button>
          <button
            type="button"
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={() => del.mutate(v.id)}
            aria-label={t('delete')}
          >
            <X className="size-3 text-muted-foreground hover:text-[var(--danger)]" />
          </button>
        </span>
      ))}
      {naming ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('namePlaceholder')}
            className="h-7 w-40 text-xs"
          />
          <Button
            type="submit"
            size="sm"
            variant="outline"
            disabled={create.isPending || !name.trim()}
          >
            {t('save')}
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setNaming(true)}>
          <Bookmark className="size-3.5" />
          {t('saveCurrent')}
        </Button>
      )}
    </div>
  );
}
