'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileText, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';
import {
  useCreateTemplate,
  useDeleteTemplate,
  useFolders,
  useMoveTemplate,
  useTemplates,
  useUpdateTemplate,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
import { ClausePicker } from '@/components/lexora/clause-picker';
import {
  FolderBrowser,
  ITEM_DRAG_MIME,
  MoveToFolderControl,
} from '@/components/lexora/folder-browser';
import { DocumentPackagesPanel } from '@/components/lexora/document-packages-panel';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { DocumentTemplate } from '@/lib/types';

/** Marcadores admitidos por el motor de render (alineados con render.ts del backend). */
const TOKENS = [
  'cliente.nombre',
  'cliente.nif',
  'cliente.email',
  'cliente.direccion',
  'expediente.referencia',
  'expediente.titulo',
  'expediente.tipo',
  'despacho.nombre',
  'despacho.nif',
  'fecha',
];

export default function TemplatesPage() {
  const t = useTranslations('templates');
  const tc = useTranslations('common');
  const { data, isLoading } = useTemplates();
  const { data: folders } = useFolders('TEMPLATE');
  const remove = useDeleteTemplate();
  const move = useMoveTemplate();
  const [editing, setEditing] = useState<DocumentTemplate | 'new' | null>(null);
  const [deleting, setDeleting] = useState<DocumentTemplate | null>(null);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);

  // Plantillas visibles = las de la carpeta actual (folderId nulo = raíz).
  const visible = useMemo(
    () => (data ?? []).filter((tpl) => (tpl.folderId ?? null) === currentFolderId),
    [data, currentFolderId],
  );

  return (
    <div className="mx-auto max-w-[900px] space-y-6">
      <PageHeader
        title={t('title')}
        subtitle={t('subtitle')}
        actions={
          <Button size="sm" onClick={() => setEditing('new')}>
            <Plus /> {t('new')}
          </Button>
        }
      />

      {isLoading && <Skeleton className="h-40 w-full rounded-xl" />}

      {!isLoading && data && (
        <FolderBrowser
          kind="TEMPLATE"
          folders={folders ?? []}
          currentFolderId={currentFolderId}
          onNavigate={setCurrentFolderId}
          onItemDrop={(folderId, id) => move.mutate({ id, folderId })}
        />
      )}

      {!isLoading && data && visible.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center text-sm text-muted-foreground">
            <FileText className="size-6" />
            {data.length === 0 ? t('empty') : t('emptyFolder')}
            <Button size="sm" variant="outline" onClick={() => setEditing('new')}>
              <Plus /> {t('createFirst')}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {visible.map((tpl) => (
          <Card
            key={tpl.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData(ITEM_DRAG_MIME, tpl.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
            className="cursor-grab active:cursor-grabbing"
          >
            <CardContent className="flex items-start gap-3 p-4">
              <FileText className="mt-0.5 size-4 text-[var(--brand)]" />
              <div className="min-w-0 flex-1">
                <div className="font-medium">{tpl.name}</div>
                {tpl.description && (
                  <div className="text-[12.5px] text-muted-foreground">{tpl.description}</div>
                )}
                {tpl.tokens && tpl.tokens.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {tpl.tokens.map((tok) => (
                      <code
                        key={tok}
                        className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10.5px] text-muted-foreground"
                      >
                        {`{{${tok}}}`}
                      </code>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5">
                <MoveToFolderControl
                  folders={folders ?? []}
                  value={tpl.folderId}
                  disabled={move.isPending}
                  onMove={(folderId) => move.mutate({ id: tpl.id, folderId })}
                />
                <Button size="sm" variant="ghost" onClick={() => setEditing(tpl)}>
                  <Pencil /> {t('edit')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setDeleting(tpl)}
                  aria-label={t('delete')}
                >
                  <Trash2 className="text-[var(--danger)]" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="border-t pt-6">
        <DocumentPackagesPanel />
      </div>

      <TemplateDialog
        template={editing}
        folderId={currentFolderId}
        onClose={() => setEditing(null)}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('confirmDelete', { name: deleting?.name ?? '' })}
        confirmLabel={tc('delete')}
        loading={remove.isPending}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
      />
    </div>
  );
}

function TemplateDialog({
  template,
  folderId,
  onClose,
}: {
  template: DocumentTemplate | 'new' | null;
  folderId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('templates');
  const create = useCreateTemplate();
  const update = useUpdateTemplate();
  const isNew = template === 'new';
  const existing = template && template !== 'new' ? template : null;

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [initId, setInitId] = useState<string | null>(null);

  // Sincroniza el formulario al abrir/cambiar de plantilla.
  const currentId = existing?.id ?? (isNew ? 'new' : null);
  if (currentId !== initId) {
    setInitId(currentId);
    setName(existing?.name ?? '');
    setDescription(existing?.description ?? '');
    setBody(existing?.body ?? '');
    setError(null);
  }

  const valid = name.trim().length >= 2 && body.trim().length >= 1;
  const pending = create.isPending || update.isPending;

  async function submit() {
    setError(null);
    try {
      if (existing) {
        await update.mutateAsync({
          id: existing.id,
          name: name.trim(),
          description: description.trim(),
          body,
        });
      } else {
        await create.mutateAsync({
          name: name.trim(),
          description: description.trim(),
          body,
          folderId,
        });
      }
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('saveError'));
    }
  }

  return (
    <Dialog open={template !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isNew ? t('newTitle') : t('editTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDesc')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !pending) submit();
          }}
        >
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">{t('name')}</Label>
              <Input
                id="tpl-name"
                name="templateName"
                autoComplete="off"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">{t('description')}</Label>
              <Input
                id="tpl-desc"
                name="templateDescription"
                autoComplete="off"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-body">{t('body')}</Label>
              <Textarea
                id="tpl-body"
                name="templateBody"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={10}
                className="font-mono text-[12.5px]"
                placeholder={t('bodyPlaceholder')}
              />
              <p className="text-[11px] text-muted-foreground">{t('tokensHelp')}</p>
              <div className="flex flex-wrap gap-1">
                {TOKENS.map((tok) => (
                  <button
                    key={tok}
                    type="button"
                    onClick={() => setBody((b) => `${b}{{${tok}}}`)}
                    className="rounded bg-[var(--surface-2)] px-1.5 py-0.5 text-[10.5px] text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {`{{${tok}}}`}
                  </button>
                ))}
              </div>
              <ClausePicker
                onInsert={(clauseBody) =>
                  setBody((b) => (b.trim() ? `${b}\n\n${clauseBody}` : clauseBody))
                }
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </div>
          <DialogFooter className="mt-4">
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!valid || pending}>
              {pending && <Loader2 className="animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
