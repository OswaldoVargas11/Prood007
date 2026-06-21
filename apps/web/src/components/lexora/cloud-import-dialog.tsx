'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  Building2,
  ChevronRight,
  Cloud,
  FileText,
  Folder,
  HardDrive,
  Loader2,
  Search,
} from 'lucide-react';
import {
  useGoogleDriveConfig,
  useImportCloudDocument,
  useMicrosoftFiles,
  useMicrosoftFilesStatus,
  useSharePointSites,
  type CloudEntry,
} from '@/lib/hooks';
import { openGooglePicker } from '@/lib/google-picker';
import { formatBytes } from '@/lib/doc-status';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

/** Un nivel del explorador (raíz o subcarpeta). El último elemento del stack es la ubicación actual. */
type Frame = { driveId?: string; itemId?: string; label: string };

export function CloudImportDialog({
  matterId,
  open,
  onClose,
}: {
  matterId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('documents.cloud');
  const drive = useGoogleDriveConfig();
  const msFiles = useMicrosoftFilesStatus();
  const importDoc = useImportCloudDocument(matterId);

  // Navegación: null = pantalla de elección; 'sites' = buscador de SharePoint; Frame[] = explorando.
  const [view, setView] = useState<'choose' | 'sites'>('choose');
  const [path, setPath] = useState<Frame[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setView('choose');
    setPath(null);
    setError(null);
  }
  function close() {
    reset();
    onClose();
  }

  async function pickFromGoogle() {
    setError(null);
    const cfg = drive.data;
    if (!cfg?.clientId || !cfg.apiKey || !cfg.appId) return;
    try {
      const picked = await openGooglePicker({
        clientId: cfg.clientId,
        apiKey: cfg.apiKey,
        appId: cfg.appId,
        scope: cfg.scope,
      });
      if (!picked) return; // cancelado
      await importDoc.mutateAsync({ provider: 'google', fileId: picked.id, name: picked.name });
      close();
    } catch {
      setError(t('importError'));
    }
  }

  async function importMicrosoft(entry: CloudEntry) {
    if (!entry.driveId) return;
    setError(null);
    try {
      await importDoc.mutateAsync({
        provider: 'microsoft',
        driveId: entry.driveId,
        itemId: entry.id,
        name: entry.name,
      });
      close();
    } catch {
      setError(t('importError'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
          <DialogDescription>{t('subtitle')}</DialogDescription>
        </DialogHeader>

        {importDoc.isPending && (
          <div className="flex items-center gap-2 rounded-md border border-border bg-[var(--surface-2)] px-3 py-2 text-sm">
            <Loader2 className="size-4 animate-spin" />
            {t('importing')}
          </div>
        )}
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}

        {/* Pantalla de elección de proveedor */}
        {view === 'choose' && path === null && (
          <div className="space-y-2">
            <ProviderTile
              icon={<HardDrive className="size-5 text-[var(--brand)]" />}
              title={t('googleDrive')}
              hint={
                !drive.data?.configured
                  ? t('notConfigured')
                  : !drive.data.connected
                    ? t('connectHint', { provider: 'Google' })
                    : undefined
              }
              disabled={!drive.data?.configured || !drive.data.connected || importDoc.isPending}
              onClick={pickFromGoogle}
            />
            <ProviderTile
              icon={<Cloud className="size-5 text-[var(--brand)]" />}
              title={t('oneDrive')}
              hint={
                !msFiles.data?.configured
                  ? t('notConfigured')
                  : !msFiles.data.connected
                    ? t('connectHint', { provider: 'Microsoft' })
                    : undefined
              }
              disabled={!msFiles.data?.configured || !msFiles.data.connected || importDoc.isPending}
              onClick={() => setPath([{ label: t('oneDrive') }])}
            />
            <ProviderTile
              icon={<Building2 className="size-5 text-[var(--brand)]" />}
              title={t('sharePoint')}
              hint={
                !msFiles.data?.configured
                  ? t('notConfigured')
                  : !msFiles.data.connected
                    ? t('connectHint', { provider: 'Microsoft' })
                    : undefined
              }
              disabled={!msFiles.data?.configured || !msFiles.data.connected || importDoc.isPending}
              onClick={() => setView('sites')}
            />
          </div>
        )}

        {/* Buscador de sitios de SharePoint */}
        {view === 'sites' && path === null && (
          <SharePointSearch
            onBack={reset}
            onPick={(driveId, label) => {
              setView('choose');
              setPath([{ driveId, label }]);
            }}
          />
        )}

        {/* Explorador de carpetas (OneDrive o una unidad de SharePoint) */}
        {path !== null && (
          <FileBrowser
            path={path}
            onNavigate={setPath}
            onBack={reset}
            onImport={importMicrosoft}
            busy={importDoc.isPending}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ProviderTile({
  icon,
  title,
  hint,
  disabled,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-lg border border-border bg-[var(--surface-1)] px-4 py-3 text-left transition-colors hover:bg-[var(--surface-2)] disabled:cursor-not-allowed disabled:opacity-60"
    >
      {icon}
      <div className="min-w-0">
        <p className="text-sm font-medium">{title}</p>
        {hint && <p className="truncate text-xs text-muted-foreground">{hint}</p>}
      </div>
      <ChevronRight className="ml-auto size-4 text-muted-foreground" />
    </button>
  );
}

function SharePointSearch({
  onBack,
  onPick,
}: {
  onBack: () => void;
  onPick: (driveId: string, label: string) => void;
}) {
  const t = useTranslations('documents.cloud');
  const [term, setTerm] = useState('');
  const [query, setQuery] = useState('');
  const sites = useSharePointSites(query, query.length > 0);

  return (
    <div className="space-y-3">
      <BrowserHeader title={t('sharePoint')} onBack={onBack} />
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(term.trim());
        }}
      >
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={t('searchSites')}
          autoFocus
        />
        <Button type="submit" size="sm" variant="outline" disabled={!term.trim()}>
          <Search className="size-4" />
        </Button>
      </form>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {query.length === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('searchSitesHint')}</p>
        )}
        {query.length > 0 && sites.isLoading && <Skeleton className="h-24 w-full" />}
        {query.length > 0 && !sites.isLoading && (sites.data?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('noSites')}</p>
        )}
        {sites.data?.map((s) => (
          <button
            key={s.id}
            type="button"
            disabled={!s.driveId}
            onClick={() => s.driveId && onPick(s.driveId, s.name)}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
          >
            <Building2 className="size-4 text-[var(--brand)]" />
            <span className="truncate">{s.name}</span>
            <ChevronRight className="ml-auto size-4 text-muted-foreground" />
          </button>
        ))}
      </div>
    </div>
  );
}

function FileBrowser({
  path,
  onNavigate,
  onBack,
  onImport,
  busy,
}: {
  path: Frame[];
  onNavigate: (path: Frame[]) => void;
  onBack: () => void;
  onImport: (entry: CloudEntry) => void;
  busy: boolean;
}) {
  const t = useTranslations('documents.cloud');
  const current = path[path.length - 1];
  const files = useMicrosoftFiles({ driveId: current.driveId, itemId: current.itemId }, true);

  return (
    <div className="space-y-3">
      <BrowserHeader title={current.label} onBack={onBack} />
      {/* Migas de pan */}
      <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        {path.map((frame, i) => (
          <span key={i} className="flex items-center gap-1">
            {i > 0 && <ChevronRight className="size-3" />}
            <button
              type="button"
              className="hover:text-foreground hover:underline"
              onClick={() => onNavigate(path.slice(0, i + 1))}
            >
              {frame.label}
            </button>
          </span>
        ))}
      </div>
      <div className="max-h-72 space-y-1 overflow-y-auto">
        {files.isLoading && <Skeleton className="h-24 w-full" />}
        {files.isError && <p className="text-sm text-[var(--danger)]">{t('listError')}</p>}
        {!files.isLoading && !files.isError && (files.data?.length ?? 0) === 0 && (
          <p className="py-6 text-center text-sm text-muted-foreground">{t('emptyFolder')}</p>
        )}
        {files.data?.map((entry) =>
          entry.isFolder ? (
            <button
              key={entry.id}
              type="button"
              onClick={() =>
                onNavigate([
                  ...path,
                  {
                    driveId: entry.driveId ?? current.driveId,
                    itemId: entry.id,
                    label: entry.name,
                  },
                ])
              }
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)]"
            >
              <Folder className="size-4 text-[var(--brand)]" />
              <span className="truncate">{entry.name}</span>
              <ChevronRight className="ml-auto size-4 text-muted-foreground" />
            </button>
          ) : (
            <button
              key={entry.id}
              type="button"
              disabled={busy}
              onClick={() => onImport(entry)}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm hover:bg-[var(--surface-2)] disabled:opacity-50"
            >
              <FileText className="size-4 text-muted-foreground" />
              <span className="truncate">{entry.name}</span>
              {entry.sizeBytes != null && (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {formatBytes(entry.sizeBytes)}
                </span>
              )}
            </button>
          ),
        )}
      </div>
    </div>
  );
}

function BrowserHeader({ title, onBack }: { title: string; onBack: () => void }) {
  const t = useTranslations('documents.cloud');
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="ghost" onClick={onBack}>
        {t('back')}
      </Button>
      <span className="text-sm font-medium">{title}</span>
    </div>
  );
}
