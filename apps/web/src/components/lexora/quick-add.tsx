'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { CheckSquare, Clock, Loader2, Plus, X } from 'lucide-react';
import { useCreateTask, useGlobalSearch, useLogTime } from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
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

type Picked = { id: string; label: string } | null;

/** Atajo "+" en la topbar: imputar horas o crear tarea desde cualquier pantalla, sin navegar. */
export function QuickAdd() {
  const t = useTranslations('quickAdd');
  const [dialog, setDialog] = useState<'time' | 'task' | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon" aria-label={t('open')}>
            <Plus className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuItem onSelect={() => setDialog('time')}>
            <Clock /> {t('logTime')}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDialog('task')}>
            <CheckSquare /> {t('newTask')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <TimeDialog open={dialog === 'time'} onClose={() => setDialog(null)} />
      <TaskDialog open={dialog === 'task'} onClose={() => setDialog(null)} />
    </>
  );
}

/** Selector de expediente buscable (reusa la búsqueda global). */
function MatterPicker({
  value,
  onChange,
  placeholder,
}: {
  value: Picked;
  onChange: (m: Picked) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState('');
  const { data, isFetching } = useGlobalSearch(q);
  const matters = data?.matters ?? [];

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border bg-[var(--surface-1)] px-3 py-2 text-sm">
        <span className="flex-1 truncate">{value.label}</span>
        <button type="button" onClick={() => onChange(null)} aria-label="x">
          <X className="size-4 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} />
      {q.trim().length >= 2 && (
        <div className="absolute z-50 mt-1 max-h-56 w-full overflow-auto rounded-md border bg-popover shadow-md">
          {isFetching && matters.length === 0 ? (
            <div className="flex items-center gap-2 px-3 py-2 text-[12.5px] text-muted-foreground">
              <Loader2 className="size-3.5 animate-spin" />
            </div>
          ) : matters.length === 0 ? (
            <div className="px-3 py-2 text-[12.5px] text-muted-foreground">—</div>
          ) : (
            matters.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => {
                  onChange({ id: m.id, label: `${m.reference} · ${m.title}` });
                  setQ('');
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] hover:bg-accent"
              >
                <span className="flex-1 truncate">{m.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/** Imputar horas: expediente + minutos + descripción. La tarifa la pone el backend (tarifa del letrado). */
function TimeDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('quickAdd');
  const log = useLogTime();
  const [matter, setMatter] = useState<Picked>(null);
  const [minutes, setMinutes] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(todayIso());
  const [error, setError] = useState<string | null>(null);

  const mins = Number(minutes);
  const valid = matter && mins > 0 && description.trim().length >= 2;

  function reset() {
    setMatter(null);
    setMinutes('');
    setDescription('');
    setDate(todayIso());
    setError(null);
  }
  async function submit() {
    if (!matter) return;
    setError(null);
    try {
      await log.mutateAsync({
        matterId: matter.id,
        description: description.trim(),
        minutes: mins,
        workedAt: new Date(date).toISOString(),
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('logTime')}</DialogTitle>
          <DialogDescription>{t('logTimeDesc')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !log.isPending) submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>{t('matter')}</Label>
            <MatterPicker
              value={matter}
              onChange={setMatter}
              placeholder={t('matterPlaceholder')}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>{t('minutes')}</Label>
              <Input
                inputMode="numeric"
                value={minutes}
                onChange={(e) => setMinutes(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="60"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>{t('description')}</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} autoFocus />
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              {t('cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!valid || log.isPending}>
              {log.isPending && <Loader2 className="animate-spin" />}
              {t('save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Nueva tarea: título + expediente opcional + vencimiento opcional. */
function TaskDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('quickAdd');
  const create = useCreateTask();
  const [title, setTitle] = useState('');
  const [matter, setMatter] = useState<Picked>(null);
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const valid = title.trim().length >= 2;

  function reset() {
    setTitle('');
    setMatter(null);
    setDueDate('');
    setError(null);
  }
  async function submit() {
    setError(null);
    try {
      await create.mutateAsync({
        title: title.trim(),
        ...(matter ? { matterId: matter.id } : {}),
        ...(dueDate ? { dueDate: new Date(dueDate).toISOString() } : {}),
      });
      reset();
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t('error'));
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose();
        }
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('newTask')}</DialogTitle>
          <DialogDescription>{t('newTaskDesc')}</DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valid && !create.isPending) submit();
          }}
          className="space-y-3"
        >
          <div className="space-y-1.5">
            <Label>{t('taskTitle')}</Label>
            <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>
                {t('matter')} <span className="text-muted-foreground">({t('optional')})</span>
              </Label>
              <MatterPicker
                value={matter}
                onChange={setMatter}
                placeholder={t('matterPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label>
                {t('due')} <span className="text-muted-foreground">({t('optional')})</span>
              </Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
          <DialogFooter>
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
