'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { BookmarkPlus, X } from 'lucide-react';
import { useCreateEmailSnippet, useDeleteEmailSnippet, useEmailSnippets } from '@/lib/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

/**
 * Plantillas de correo del despacho dentro del compositor: pulsa una para insertarla (asunto + cuerpo)
 * o guarda el borrador actual como nueva plantilla. Compartidas por todo el despacho.
 */
export function EmailSnippetPicker({
  subject,
  body,
  onInsert,
}: {
  subject: string;
  body: string;
  onInsert: (s: { subject: string | null; body: string }) => void;
}) {
  const t = useTranslations('emailSnippets');
  const { data: snippets } = useEmailSnippets();
  const create = useCreateEmailSnippet();
  const del = useDeleteEmailSnippet();
  const [naming, setNaming] = useState(false);
  const [name, setName] = useState('');

  async function save() {
    if (!name.trim() || !body.trim()) return;
    await create.mutateAsync({ name: name.trim(), subject: subject.trim() || undefined, body });
    setName('');
    setNaming(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {snippets?.map((s) => (
        <span
          key={s.id}
          className="group inline-flex items-center gap-1 rounded-full border bg-[var(--surface-1)] px-2.5 py-1 text-xs"
        >
          <button
            type="button"
            className="hover:text-[var(--brand)]"
            onClick={() => onInsert({ subject: s.subject, body: s.body })}
          >
            {s.name}
          </button>
          <button
            type="button"
            className="opacity-60 transition-opacity hover:opacity-100"
            onClick={() => del.mutate(s.id)}
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
            disabled={create.isPending || !name.trim() || !body.trim()}
          >
            {t('save')}
          </Button>
        </form>
      ) : (
        <Button size="sm" variant="ghost" onClick={() => setNaming(true)} disabled={!body.trim()}>
          <BookmarkPlus className="size-3.5" />
          {t('saveCurrent')}
        </Button>
      )}
    </div>
  );
}
