'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Plus, Table2, X } from 'lucide-react';
import { Link, useRouter } from '@/i18n/navigation';
import {
  useAiStatus,
  useCreateTabularReview,
  useDataRoom,
  useMatter,
  useMatterDataRooms,
  useMatterDocuments,
  useTabularReviews,
} from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Revisión tabular del expediente: lista de revisiones (documentos × columnas en lenguaje natural) y
 * alta de una nueva a partir de una selección de documentos o de un data room (carpeta o completo).
 */
export default function TabularReviewsPage() {
  const { id } = useParams<{ id: string }>();
  const t = useTranslations('tabularReview');
  const router = useRouter();

  const matter = useMatter(id);
  const { data: aiStatus } = useAiStatus();
  const { data: reviews, isLoading } = useTabularReviews(id);
  const [createOpen, setCreateOpen] = useState(false);

  const aiEnabled = Boolean(aiStatus?.enabled);

  return (
    <div className="mx-auto max-w-[1100px] space-y-4">
      <div>
        <Link
          href={`/matters/${id}`}
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          ← {matter.data?.reference ?? t('back')}
        </Link>
        <div className="mt-2 flex items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{t('title')}</h1>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{t('subtitle')}</p>
          </div>
          {aiEnabled && (
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-1.5 size-4" /> {t('new')}
            </Button>
          )}
        </div>
      </div>

      {!aiEnabled ? (
        <Card>
          <EmptyState icon={Table2} title={t('aiDisabledTitle')} description={t('aiDisabled')} />
        </Card>
      ) : isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </div>
      ) : (reviews?.length ?? 0) === 0 ? (
        <Card>
          <EmptyState
            icon={Table2}
            title={t('emptyTitle')}
            description={t('emptyDescription')}
            action={
              <Button size="sm" onClick={() => setCreateOpen(true)}>
                <Plus className="mr-1.5 size-4" /> {t('new')}
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="space-y-2">
          {reviews!.map((r) => {
            const total = r.progress.pending + r.progress.done + r.progress.failed;
            return (
              <Card
                key={r.id}
                interactive
                className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3"
                onClick={() => router.push(`/matters/${id}/tabular-reviews/${r.id}`)}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium">{r.title}</p>
                  <p className="mt-0.5 text-[12.5px] text-muted-foreground">
                    {t('summaryLine', {
                      docs: r.documentCount,
                      cols: r.columns.length,
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {r.progress.pending > 0 ? (
                    <Badge variant="outline">
                      {t('progressPending', { done: r.progress.done, total })}
                    </Badge>
                  ) : r.progress.failed > 0 ? (
                    <Badge variant="outline" className="text-red-600">
                      {t('progressFailed', { failed: r.progress.failed })}
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="text-emerald-600">
                      {t('progressDone')}
                    </Badge>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateReviewDialog
        matterId={id}
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={(reviewId) => router.push(`/matters/${id}/tabular-reviews/${reviewId}`)}
      />
    </div>
  );
}

function CreateReviewDialog({
  matterId,
  open,
  onOpenChange,
  onCreated,
}: {
  matterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (reviewId: string) => void;
}) {
  const t = useTranslations('tabularReview');
  const create = useCreateTabularReview(matterId);

  const [title, setTitle] = useState('');
  const [columns, setColumns] = useState<string[]>([]);
  const [columnDraft, setColumnDraft] = useState('');
  const [mode, setMode] = useState<'documents' | 'dataroom'>('documents');
  const [selectedDocs, setSelectedDocs] = useState<Set<string>>(new Set());
  const [roomId, setRoomId] = useState('');
  const [folderId, setFolderId] = useState('');

  const { data: docs } = useMatterDocuments(open && mode === 'documents' ? matterId : '');
  const { data: rooms } = useMatterDataRooms(open && mode === 'dataroom' ? matterId : '');
  const room = useDataRoom(mode === 'dataroom' && roomId ? roomId : null);

  const canSubmit =
    title.trim().length >= 2 &&
    columns.length > 0 &&
    (mode === 'documents' ? selectedDocs.size > 0 : Boolean(roomId)) &&
    !create.isPending;

  function addColumn() {
    const label = columnDraft.trim();
    if (label.length < 2 || columns.length >= 12) return;
    setColumns((prev) => [...prev, label]);
    setColumnDraft('');
  }

  function toggleDoc(docId: string) {
    setSelectedDocs((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  }

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        title: title.trim(),
        columns: columns.map((label) => ({ label })),
        ...(mode === 'documents'
          ? { documentIds: [...selectedDocs] }
          : folderId
            ? { dataRoomFolderId: folderId }
            : { dataRoomId: roomId }),
      },
      {
        onSuccess: (review) => {
          onOpenChange(false);
          setTitle('');
          setColumns([]);
          setSelectedDocs(new Set());
          setRoomId('');
          setFolderId('');
          onCreated(review.id);
        },
      },
    );
  }

  const selectClass =
    'h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('createTitle')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('nameLabel')}</label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('namePlaceholder')}
              maxLength={160}
            />
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('columnsLabel')}</label>
            <p className="mb-2 text-[12px] text-muted-foreground">{t('columnsHint')}</p>
            <div className="flex gap-2">
              <Input
                value={columnDraft}
                onChange={(e) => setColumnDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addColumn();
                  }
                }}
                placeholder={t('columnPlaceholder')}
                maxLength={200}
              />
              <Button type="button" variant="outline" onClick={addColumn}>
                {t('addColumn')}
              </Button>
            </div>
            {columns.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {columns.map((label, i) => (
                  <Badge key={`${label}-${i}`} variant="outline" className="gap-1 pr-1">
                    {label}
                    <button
                      type="button"
                      aria-label={t('removeColumn')}
                      onClick={() => setColumns((prev) => prev.filter((_, j) => j !== i))}
                      className="rounded-sm p-0.5 hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[12.5px] font-medium">{t('sourceLabel')}</label>
            <div className="mb-2 flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={mode === 'documents' ? 'default' : 'outline'}
                onClick={() => setMode('documents')}
              >
                {t('sourceDocuments')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'dataroom' ? 'default' : 'outline'}
                onClick={() => setMode('dataroom')}
              >
                {t('sourceDataRoom')}
              </Button>
            </div>

            {mode === 'documents' ? (
              <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border p-2">
                {(docs ?? []).length === 0 ? (
                  <p className="px-1 py-2 text-[12.5px] text-muted-foreground">
                    {t('noDocuments')}
                  </p>
                ) : (
                  (docs ?? []).map((d) => (
                    <label
                      key={d.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-[13px] hover:bg-muted/60',
                        selectedDocs.has(d.id) && 'bg-muted/60',
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selectedDocs.has(d.id)}
                        onChange={() => toggleDoc(d.id)}
                        className="size-3.5 accent-[var(--brand)]"
                      />
                      <span className="truncate">{d.name}</span>
                    </label>
                  ))
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <select
                  value={roomId}
                  onChange={(e) => {
                    setRoomId(e.target.value);
                    setFolderId('');
                  }}
                  className={selectClass}
                >
                  <option value="">{t('pickDataRoom')}</option>
                  {(rooms ?? []).map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                {roomId && (
                  <select
                    value={folderId}
                    onChange={(e) => setFolderId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="">{t('wholeDataRoom')}</option>
                    {(room.data?.folders ?? []).map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('cancel')}
            </Button>
            <Button onClick={submit} disabled={!canSubmit}>
              {create.isPending ? t('creating') : t('create')}
            </Button>
          </div>
          {create.isError && <p className="text-[12.5px] text-red-600">{t('createError')}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}
