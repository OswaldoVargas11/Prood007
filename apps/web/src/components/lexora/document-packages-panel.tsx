'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Loader2, Package, Plus, Trash2, Wand2 } from 'lucide-react';
import {
  useCreateDocumentPackage,
  useDeleteDocumentPackage,
  useDocumentPackages,
  useGenerateFromTemplates,
  useMatters,
  useTemplates,
  type DocumentPackage,
} from '@/lib/hooks';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

/**
 * Paquetes de documentos: el despacho define un conjunto reutilizable de plantillas (p. ej. el set de
 * intake) y lo genera de una pasada sobre un expediente. Compartidos por el despacho.
 */
export function DocumentPackagesPanel() {
  const t = useTranslations('packages');
  const templates = useTemplates();
  const packages = useDocumentPackages();
  const create = useCreateDocumentPackage();
  const del = useDeleteDocumentPackage();

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [generateFor, setGenerateFor] = useState<DocumentPackage | null>(null);

  const templateName = (id: string) => templates.data?.find((x) => x.id === id)?.name ?? '—';

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    if (!name.trim() || selected.length === 0) return;
    try {
      await create.mutateAsync({ name: name.trim(), templateIds: selected });
      toast.success(t('saved'));
      setName('');
      setSelected([]);
      setAdding(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('saveError'));
    }
  }

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Package className="size-4 text-[var(--brand)]" />
          <h2 className="text-sm font-medium">{t('title')}</h2>
        </div>
        {!adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)}>
            <Plus className="size-4" />
            {t('new')}
          </Button>
        )}
      </div>
      <p className="text-[12.5px] text-muted-foreground">{t('hint')}</p>

      {adding && (
        <Card>
          <CardContent className="space-y-3 p-4">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('namePlaceholder')}
            />
            <div className="space-y-1">
              <div className="text-xs font-medium text-muted-foreground">
                {t('chooseTemplates')}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {templates.data?.map((tpl) => (
                  <button
                    key={tpl.id}
                    type="button"
                    onClick={() => toggle(tpl.id)}
                    className={cn(
                      'rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors',
                      selected.includes(tpl.id)
                        ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand)]'
                        : 'text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {tpl.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-1.5">
              <Button
                size="sm"
                onClick={save}
                disabled={create.isPending || !name.trim() || selected.length === 0}
              >
                {create.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('save')}
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
                {t('cancel')}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        {packages.data?.length === 0 && !adding && (
          <Card>
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              {t('empty')}
            </CardContent>
          </Card>
        )}
        {packages.data?.map((p) => (
          <Card key={p.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{p.name}</div>
                <div className="text-[12.5px] text-muted-foreground">
                  {p.templateIds.map(templateName).join(' · ')}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setGenerateFor(p)}>
                  <Wand2 className="size-4" />
                  {t('generate')}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => del.mutate(p.id)}
                  disabled={del.isPending}
                  aria-label={t('delete')}
                >
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <GenerateDialog pkg={generateFor} onClose={() => setGenerateFor(null)} />
    </section>
  );
}

function GenerateDialog({ pkg, onClose }: { pkg: DocumentPackage | null; onClose: () => void }) {
  const t = useTranslations('packages');
  const matters = useMatters({ pageSize: 100 });
  const generate = useGenerateFromTemplates();
  const [matterId, setMatterId] = useState('');

  async function run() {
    if (!pkg || !matterId) return;
    try {
      const res = await generate.mutateAsync({ matterId, templateIds: pkg.templateIds });
      toast.success(t('generated', { count: res.count }));
      setMatterId('');
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('generateError'));
    }
  }

  return (
    <Dialog open={pkg !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('generateTitle', { name: pkg?.name ?? '' })}</DialogTitle>
          <DialogDescription>{t('generateHint')}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">{t('matter')}</label>
            <select
              value={matterId}
              onChange={(e) => setMatterId(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">{t('chooseMatter')}</option>
              {matters.data?.items.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.reference} — {m.title}
                </option>
              ))}
            </select>
          </div>
          <Button onClick={run} disabled={!matterId || generate.isPending} className="w-full">
            {generate.isPending && <Loader2 className="size-4 animate-spin" />}
            {t('generate')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
