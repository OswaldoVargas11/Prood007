'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ChevronRight,
  Folder as FolderIcon,
  FolderPlus,
  Home,
  MoreVertical,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCreateFolder, useDeleteFolder, useUpdateFolder } from '@/lib/hooks';
import type { Folder, FolderKind } from '@/lib/types';
import { ConfirmDialog } from '@/components/lexora/confirm-dialog';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

/**
 * Tipo MIME del arrastre de un ítem (documento/plantilla) hacia una carpeta. La fuente del arrastre
 * (la fila del documento/plantilla) hace `setData(ITEM_DRAG_MIME, id)`; las carpetas son destinos.
 */
export const ITEM_DRAG_MIME = 'application/x-lf-item';

/** Construye la ruta (raíz→actual) de una carpeta subiendo por `parentId`. */
export function folderPath(folders: Folder[], folderId: string | null): Folder[] {
  const byId = new Map(folders.map((f) => [f.id, f]));
  const path: Folder[] = [];
  let cursor = folderId;
  for (let i = 0; cursor && i < 100; i += 1) {
    const node = byId.get(cursor);
    if (!node) break;
    path.unshift(node);
    cursor = node.parentId;
  }
  return path;
}

/**
 * Navegador de carpetas reutilizable (documentos de expediente o plantillas del despacho). El padre
 * es dueño de `currentFolderId` (para filtrar sus ítems) y de la lista `folders`; aquí se gestionan
 * crear / renombrar / eliminar / entrar en carpeta. Mover ítems se hace con <MoveToFolderControl/>.
 */
export function FolderBrowser({
  kind,
  matterId,
  folders,
  currentFolderId,
  onNavigate,
  onItemDrop,
}: {
  kind: FolderKind;
  matterId?: string;
  folders: Folder[];
  currentFolderId: string | null;
  onNavigate: (folderId: string | null) => void;
  /** Si se define, las carpetas (y «Inicio») aceptan soltar un ítem arrastrado para moverlo. */
  onItemDrop?: (folderId: string | null, itemId: string) => void;
}) {
  const t = useTranslations('files');
  const tc = useTranslations('common');
  const create = useCreateFolder(kind, matterId);
  const update = useUpdateFolder(kind, matterId);
  const del = useDeleteFolder(kind, matterId);

  const [dialog, setDialog] = useState<{ mode: 'new' | 'rename'; folder?: Folder } | null>(null);
  const [name, setName] = useState('');
  const [deleting, setDeleting] = useState<Folder | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Handlers de soltar para un destino (carpeta o raíz=null). Solo activos si hay onItemDrop.
  const dropProps = (target: string | null) =>
    onItemDrop
      ? {
          onDragOver: (e: React.DragEvent) => {
            if (e.dataTransfer.types.includes(ITEM_DRAG_MIME)) {
              e.preventDefault();
              setDropTarget(target ?? '__root__');
            }
          },
          onDragLeave: () => setDropTarget(null),
          onDrop: (e: React.DragEvent) => {
            e.preventDefault();
            const id = e.dataTransfer.getData(ITEM_DRAG_MIME);
            setDropTarget(null);
            if (id) onItemDrop(target, id);
          },
        }
      : {};
  const isDropping = (target: string | null) => dropTarget === (target ?? '__root__');

  const path = useMemo(() => folderPath(folders, currentFolderId), [folders, currentFolderId]);
  const subfolders = useMemo(
    () =>
      folders
        .filter((f) => f.parentId === currentFolderId)
        .sort((a, b) => a.name.localeCompare(b.name)),
    [folders, currentFolderId],
  );

  function openNew() {
    setName('');
    setDialog({ mode: 'new' });
  }
  function openRename(folder: Folder) {
    setName(folder.name);
    setDialog({ mode: 'rename', folder });
  }

  async function submit() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (dialog?.mode === 'new') {
      await create.mutateAsync({ name: trimmed, parentId: currentFolderId });
    } else if (dialog?.mode === 'rename' && dialog.folder) {
      await update.mutateAsync({ id: dialog.folder.id, name: trimmed });
    }
    setDialog(null);
  }

  return (
    <div className="space-y-3">
      {/* Migas de pan */}
      <div className="flex flex-wrap items-center gap-1 text-[13px]">
        <button
          type="button"
          onClick={() => onNavigate(null)}
          {...dropProps(null)}
          className={cn(
            'inline-flex items-center gap-1 rounded-md px-2 py-1 text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
            isDropping(null) &&
              'bg-[var(--brand-soft)] text-[var(--brand)] ring-1 ring-[var(--brand)]',
          )}
        >
          <Home className="size-3.5" /> {t('root')}
        </button>
        {path.map((f) => (
          <span key={f.id} className="inline-flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" />
            <button
              type="button"
              onClick={() => onNavigate(f.id)}
              className="rounded-md px-2 py-1 transition-colors hover:bg-accent/60"
            >
              {f.name}
            </button>
          </span>
        ))}
        <Button size="sm" variant="ghost" className="ml-auto" onClick={openNew}>
          <FolderPlus className="size-4" /> {t('newFolder')}
        </Button>
      </div>

      {/* Subcarpetas del nivel actual */}
      {subfolders.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {subfolders.map((f) => (
            <div
              key={f.id}
              {...dropProps(f.id)}
              className={cn(
                'group flex items-center gap-2 rounded-lg border bg-card px-3 py-2.5 transition-colors hover:border-[var(--brand-line)]',
                isDropping(f.id) &&
                  'border-[var(--brand)] bg-[var(--brand-soft)] ring-1 ring-[var(--brand)]',
              )}
            >
              <button
                type="button"
                onClick={() => onNavigate(f.id)}
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
              >
                <FolderIcon className="size-4 shrink-0 text-[var(--seal)]" />
                <span className="truncate text-[13px] font-medium">{f.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-6 shrink-0 opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100"
                    aria-label={t('folderActions')}
                  >
                    <MoreVertical className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => openRename(f)}>
                    <Pencil className="size-3.5" /> {t('rename')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => setDeleting(f)}>
                    <Trash2 className="size-3.5 text-[var(--danger)]" /> {tc('delete')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </div>
      )}

      {/* Diálogo crear/renombrar */}
      <Dialog open={dialog !== null} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>
              {dialog?.mode === 'rename' ? t('renameFolder') : t('newFolder')}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
            className="space-y-3"
          >
            <div className="space-y-1.5">
              <Label htmlFor="folder-name">{t('folderName')}</Label>
              <Input
                id="folder-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
                autoComplete="off"
              />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" size="sm" onClick={() => setDialog(null)}>
                {tc('cancel')}
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={!name.trim() || create.isPending || update.isPending}
              >
                {tc('save')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('confirmDeleteFolder', { name: deleting?.name ?? '' })}
        confirmLabel={tc('delete')}
        loading={del.isPending}
        onConfirm={() => {
          if (deleting)
            del.mutate(deleting.id, {
              onSuccess: () => {
                // Si borramos la carpeta en la que estamos, subimos a su padre.
                if (currentFolderId === deleting.id) onNavigate(deleting.parentId);
                setDeleting(null);
              },
            });
        }}
      />
    </div>
  );
}

/**
 * Selector compacto para mover un ítem (documento/plantilla) a una carpeta. Lista todas las carpetas
 * del contexto indentadas por profundidad, más «raíz».
 */
export function MoveToFolderControl({
  folders,
  value,
  onMove,
  disabled,
}: {
  folders: Folder[];
  value: string | null;
  onMove: (folderId: string | null) => void;
  disabled?: boolean;
}) {
  const t = useTranslations('files');
  // Orden jerárquico con indentación por profundidad.
  const options = useMemo(() => orderedFolderOptions(folders), [folders]);
  return (
    <select
      value={value ?? ''}
      disabled={disabled}
      onChange={(e) => onMove(e.target.value === '' ? null : e.target.value)}
      aria-label={t('moveTo')}
      className="h-8 max-w-[180px] rounded-md border bg-[var(--surface-1)] px-2 text-[12px] outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60"
    >
      <option value="">{t('root')}</option>
      {options.map((o) => (
        <option key={o.id} value={o.id}>
          {`${'  '.repeat(o.depth)}${o.name}`}
        </option>
      ))}
    </select>
  );
}

function orderedFolderOptions(folders: Folder[]): { id: string; name: string; depth: number }[] {
  const byParent = new Map<string | null, Folder[]>();
  for (const f of folders) {
    const key = f.parentId;
    const list = byParent.get(key) ?? [];
    list.push(f);
    byParent.set(key, list);
  }
  const out: { id: string; name: string; depth: number }[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const children = (byParent.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const c of children) {
      out.push({ id: c.id, name: c.name, depth });
      walk(c.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}
