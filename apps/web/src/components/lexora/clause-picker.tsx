'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Plus, X } from 'lucide-react';
import { useClauses, useCreateClause, useDeleteClause } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

/**
 * Biblioteca de cláusulas del despacho dentro del editor de plantillas: pulsa una para insertarla en
 * el cuerpo, o crea cláusulas reutilizables. Compartidas por todo el despacho.
 */
export function ClausePicker({ onInsert }: { onInsert: (body: string) => void }) {
  const t = useTranslations('clauses');
  const { data: clauses } = useClauses();
  const create = useCreateClause();
  const del = useDeleteClause();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [body, setBody] = useState('');

  async function save() {
    if (!name.trim() || !body.trim()) return;
    await create.mutateAsync({ name: name.trim(), body });
    setName('');
    setBody('');
    setAdding(false);
  }

  return (
    <div className="space-y-2 rounded-lg border border-dashed bg-[var(--surface-1)] p-2.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] font-medium text-muted-foreground">{t('label')}</span>
        {clauses?.length === 0 && (
          <span className="text-[11.5px] text-[var(--text-subtle)]">{t('empty')}</span>
        )}
        {clauses?.map((c) => (
          <span
            key={c.id}
            className="group inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs"
          >
            <button
              type="button"
              className="hover:text-[var(--brand)]"
              title={t('insert')}
              onClick={() => onInsert(c.body)}
            >
              {c.name}
            </button>
            <button
              type="button"
              className="opacity-60 transition-opacity hover:opacity-100"
              onClick={() => del.mutate(c.id)}
              aria-label={t('delete')}
            >
              <X className="size-3 text-muted-foreground hover:text-[var(--danger)]" />
            </button>
          </span>
        ))}
        {!adding && (
          <Button size="sm" variant="ghost" onClick={() => setAdding(true)}>
            <Plus className="size-3.5" />
            {t('new')}
          </Button>
        )}
      </div>
      {adding && (
        <form
          className="space-y-1.5"
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
            className="h-8 text-xs"
          />
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t('bodyPlaceholder')}
            className="text-xs"
          />
          <div className="flex gap-1.5">
            <Button
              type="submit"
              size="sm"
              variant="outline"
              disabled={create.isPending || !name.trim() || !body.trim()}
            >
              {t('save')}
            </Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t('cancel')}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
