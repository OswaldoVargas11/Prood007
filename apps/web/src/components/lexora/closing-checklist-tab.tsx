'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Download, FileText, Loader2, Plus, Trash2 } from 'lucide-react';
import {
  downloadClosingBinder,
  useAddChecklistItem,
  useAssignees,
  useChecklist,
  useCreateChecklist,
  useClosingTemplates,
  useDeleteChecklist,
  useDeleteChecklistItem,
  useMatterChecklists,
  useMatterDocuments,
  useUpdateChecklist,
  useUpdateChecklistItem,
} from '@/lib/hooks';
import { formatDate } from '@/lib/format';
import type { ClosingChecklistItem, ClosingItemCategory, ClosingItemStatus } from '@/lib/types';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const CATEGORY_ORDER: ClosingItemCategory[] = [
  'CONDITION_PRECEDENT',
  'DELIVERABLE',
  'SIGNATURE_PAGE',
  'OTHER',
];
const STATUSES: ClosingItemStatus[] = ['PENDING', 'IN_PROGRESS', 'WAIVED', 'SATISFIED'];

const selectClass =
  'flex h-9 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

function statusVariant(s: ClosingItemStatus): 'default' | 'secondary' | 'outline' {
  if (s === 'SATISFIED') return 'default';
  if (s === 'WAIVED') return 'secondary';
  return 'outline';
}

export function ClosingChecklistTab({ matterId }: { matterId: string }) {
  const t = useTranslations('closing');
  const { data: checklists, isLoading } = useMatterChecklists(matterId);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Selecciona automáticamente el primer checklist disponible.
  useEffect(() => {
    if (!selectedId && checklists && checklists.length > 0) {
      setSelectedId(checklists[0].id);
    }
  }, [checklists, selectedId]);

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          {checklists?.map((c) => (
            <button
              key={c.id}
              onClick={() => setSelectedId(c.id)}
              className={`rounded-full border px-3 py-1 text-xs transition ${
                selectedId === c.id
                  ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {c.title}{' '}
              <span className="opacity-70">
                {c.satisfied}/{c.total}
              </span>
            </button>
          ))}
        </div>
        <NewChecklistButton matterId={matterId} onCreated={setSelectedId} />
      </div>

      {!checklists?.length ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            {t('empty')}
          </CardContent>
        </Card>
      ) : selectedId ? (
        <ChecklistDetail
          matterId={matterId}
          checklistId={selectedId}
          onDeleted={() => setSelectedId(null)}
        />
      ) : null}
    </div>
  );
}

function NewChecklistButton({
  matterId,
  onCreated,
}: {
  matterId: string;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('closing');
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [templateKey, setTemplateKey] = useState('blank');
  const { data: templates } = useClosingTemplates();
  const create = useCreateChecklist(matterId);

  useEffect(() => {
    // Al elegir plantilla, propone su título si el usuario no ha escrito uno.
    const tpl = templates?.find((x) => x.key === templateKey);
    if (tpl && (!title || templates?.some((x) => x.title === title))) {
      setTitle(tpl.key === 'blank' ? '' : tpl.title);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateKey]);

  const submit = () => {
    const finalTitle = title.trim() || t('defaultTitle');
    create.mutate(
      { title: finalTitle, templateKey: templateKey === 'blank' ? undefined : templateKey },
      {
        onSuccess: (data) => {
          onCreated(data.id);
          setOpen(false);
          setTitle('');
          setTemplateKey('blank');
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {t('new')}
      </Button>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newTitle')}</DialogTitle>
          <DialogDescription>{t('newDescription')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cl-template">{t('template')}</Label>
            <select
              id="cl-template"
              value={templateKey}
              onChange={(e) => setTemplateKey(e.target.value)}
              className={selectClass}
            >
              {templates?.map((tpl) => (
                <option key={tpl.key} value={tpl.key}>
                  {tpl.title}
                  {tpl.itemCount > 0 ? ` (${tpl.itemCount})` : ''}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              {templates?.find((x) => x.key === templateKey)?.description}
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cl-title">{t('titleLabel')}</Label>
            <Input
              id="cl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t('titlePlaceholder')}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('cancel')}
          </Button>
          <Button onClick={submit} disabled={create.isPending}>
            {create.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ChecklistDetail({
  matterId,
  checklistId,
  onDeleted,
}: {
  matterId: string;
  checklistId: string;
  onDeleted: () => void;
}) {
  const t = useTranslations('closing');
  const tCat = useTranslations('closing.category');
  const { data: checklist, isLoading } = useChecklist(checklistId);
  const updateChecklist = useUpdateChecklist(matterId);
  const deleteChecklist = useDeleteChecklist(matterId);
  const [downloading, setDownloading] = useState(false);

  const grouped = useMemo(() => {
    const map = new Map<ClosingItemCategory, ClosingChecklistItem[]>();
    for (const cat of CATEGORY_ORDER) map.set(cat, []);
    (checklist?.items ?? []).forEach((item) => map.get(item.category)?.push(item));
    return map;
  }, [checklist]);

  if (isLoading || !checklist) {
    return <Skeleton className="h-64 w-full" />;
  }

  const total = checklist.items.length;
  const done = checklist.items.filter(
    (i) => i.status === 'SATISFIED' || i.status === 'WAIVED',
  ).length;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);

  const downloadBinder = async () => {
    setDownloading(true);
    try {
      await downloadClosingBinder(checklistId, `closing-binder-${checklist.id}.zip`);
    } finally {
      setDownloading(false);
    }
  };

  return (
    <Card>
      <CardContent className="space-y-5 pt-6">
        {/* Cabecera del checklist */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <h3 className="text-lg font-semibold">{checklist.title}</h3>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Label htmlFor="cl-date" className="text-xs">
                {t('closingDate')}
              </Label>
              <Input
                id="cl-date"
                type="date"
                className="h-8 w-40"
                defaultValue={checklist.closingDate?.slice(0, 10) ?? ''}
                onBlur={(e) => {
                  if (e.target.value) {
                    updateChecklist.mutate({ id: checklistId, closingDate: e.target.value });
                  }
                }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={downloadBinder} disabled={downloading}>
              {downloading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Download className="size-4" />
              )}
              {t('binder')}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                if (confirm(t('deleteConfirm'))) {
                  deleteChecklist.mutate(checklistId, { onSuccess: onDeleted });
                }
              }}
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>

        {/* Progreso */}
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>{t('progress')}</span>
            <span>
              {done}/{total} · {pct}%
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-[var(--surface-2)]">
            <div
              className="h-full rounded-full bg-[var(--brand)] transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>

        {/* Grupos por categoría */}
        <div className="space-y-5">
          {CATEGORY_ORDER.map((cat) => {
            const items = grouped.get(cat) ?? [];
            return (
              <div key={cat} className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-semibold text-[var(--brand-strong)]">
                    {tCat(cat)} <span className="text-muted-foreground">({items.length})</span>
                  </h4>
                </div>
                <div className="space-y-2">
                  {items.map((item) => (
                    <ItemRow
                      key={item.id}
                      matterId={matterId}
                      checklistId={checklistId}
                      item={item}
                    />
                  ))}
                </div>
                <AddItemRow matterId={matterId} checklistId={checklistId} category={cat} />
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function ItemRow({
  matterId,
  checklistId,
  item,
}: {
  matterId: string;
  checklistId: string;
  item: ClosingChecklistItem;
}) {
  const t = useTranslations('closing');
  const tStatus = useTranslations('closing.status');
  const update = useUpdateChecklistItem(matterId, checklistId);
  const remove = useDeleteChecklistItem(matterId, checklistId);
  const { data: assignees } = useAssignees();
  const { data: documents } = useMatterDocuments(matterId);
  const [editing, setEditing] = useState(false);

  const assigneeName = assignees?.find((a) => a.id === item.assigneeId)?.fullName;
  const docName = documents?.find((d) => d.id === item.documentId)?.name;

  const meta: string[] = [];
  if (item.responsibleParty) meta.push(item.responsibleParty);
  if (assigneeName) meta.push(`→ ${assigneeName}`);
  if (item.dueDate) meta.push(formatDate(item.dueDate));

  return (
    <div className="rounded-lg border bg-[var(--surface-1)] p-3">
      <div className="flex items-start gap-3">
        <select
          value={item.status}
          onChange={(e) =>
            update.mutate({ itemId: item.id, status: e.target.value as ClosingItemStatus })
          }
          className="h-8 shrink-0 rounded-md border bg-[var(--surface-1)] px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {tStatus(s)}
            </option>
          ))}
        </select>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{item.title}</p>
          {item.detail && <p className="mt-0.5 text-xs text-muted-foreground">{item.detail}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {meta.length > 0 && <span>{meta.join(' · ')}</span>}
            {docName && (
              <Badge variant="outline" className="gap-1">
                <FileText className="size-3" /> {docName}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs"
            onClick={() => setEditing(true)}
          >
            {t('edit')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 px-2"
            onClick={() => remove.mutate(item.id)}
            aria-label={t('delete')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>

      {editing && (
        <ItemEditor
          matterId={matterId}
          checklistId={checklistId}
          item={item}
          onClose={() => setEditing(false)}
        />
      )}
    </div>
  );
}

function ItemEditor({
  matterId,
  checklistId,
  item,
  onClose,
}: {
  matterId: string;
  checklistId: string;
  item: ClosingChecklistItem;
  onClose: () => void;
}) {
  const t = useTranslations('closing');
  const update = useUpdateChecklistItem(matterId, checklistId);
  const { data: assignees } = useAssignees();
  const { data: documents } = useMatterDocuments(matterId);
  const [title, setTitle] = useState(item.title);
  const [detail, setDetail] = useState(item.detail ?? '');
  const [responsibleParty, setResponsibleParty] = useState(item.responsibleParty ?? '');
  const [assigneeId, setAssigneeId] = useState(item.assigneeId ?? '');
  const [documentId, setDocumentId] = useState(item.documentId ?? '');
  const [dueDate, setDueDate] = useState(item.dueDate?.slice(0, 10) ?? '');

  const save = () => {
    update.mutate(
      {
        itemId: item.id,
        title: title.trim() || item.title,
        detail,
        responsibleParty,
        assigneeId,
        documentId,
        dueDate: dueDate || '',
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('editItem')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="it-title">{t('itemTitle')}</Label>
            <Input id="it-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="it-detail">{t('itemDetail')}</Label>
            <Textarea
              id="it-detail"
              rows={2}
              value={detail}
              onChange={(e) => setDetail(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="it-party">{t('responsibleParty')}</Label>
              <Input
                id="it-party"
                value={responsibleParty}
                onChange={(e) => setResponsibleParty(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-due">{t('dueDate')}</Label>
              <Input
                id="it-due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-assignee">{t('assignee')}</Label>
              <select
                id="it-assignee"
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className={selectClass}
              >
                <option value="">{t('none')}</option>
                {assignees?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.fullName}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="it-doc">{t('linkedDocument')}</Label>
              <select
                id="it-doc"
                value={documentId}
                onChange={(e) => setDocumentId(e.target.value)}
                className={selectClass}
              >
                <option value="">{t('none')}</option>
                {documents?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button onClick={save} disabled={update.isPending}>
            {update.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddItemRow({
  matterId,
  checklistId,
  category,
}: {
  matterId: string;
  checklistId: string;
  category: ClosingItemCategory;
}) {
  const t = useTranslations('closing');
  const add = useAddChecklistItem(matterId);
  const [title, setTitle] = useState('');

  const submit = () => {
    const value = title.trim();
    if (!value) return;
    add.mutate({ checklistId, category, title: value }, { onSuccess: () => setTitle('') });
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') submit();
        }}
        placeholder={t('addItemPlaceholder')}
        className="h-8"
      />
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0"
        onClick={submit}
        disabled={add.isPending}
      >
        <Plus className="size-4" />
      </Button>
    </div>
  );
}
