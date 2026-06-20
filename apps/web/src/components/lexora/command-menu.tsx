'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, FileText, Loader2, Receipt, Users } from 'lucide-react';
import { useRouter } from '@/i18n/navigation';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { NAV_ITEMS } from '@/lib/nav';
import { useGlobalSearch } from '@/lib/hooks';

/** Command bar (⌘K / Ctrl+K): navegación + búsqueda global (clientes, expedientes, documentos, facturas). */
export function CommandMenu({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const t = useTranslations();
  const router = useRouter();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenChange(!open);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onOpenChange]);

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      label={t('command.placeholder')}
      shouldFilter={false}
    >
      {/* shouldFilter=false: filtramos nosotros sobre los datos buscados, no solo sobre el texto visible */}
      {open && <CommandBody go={go} />}
    </CommandDialog>
  );
}

function CommandBody({ go }: { go: (href: string) => void }) {
  const t = useTranslations();
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(id);
  }, [query]);

  const searching = debounced.length >= 2;

  // Búsqueda server-side (sin tope de paginación del cliente; incluye documentos).
  const { data, isLoading } = useGlobalSearch(debounced);
  const clients = data?.clients ?? [];
  const matters = data?.matters ?? [];
  const documents = data?.documents ?? [];
  const invoices = data?.invoices ?? [];

  const loading = searching && isLoading;
  const noMatches =
    searching &&
    !loading &&
    clients.length === 0 &&
    matters.length === 0 &&
    documents.length === 0 &&
    invoices.length === 0;

  return (
    <>
      <CommandInput placeholder={t('command.placeholder')} value={query} onValueChange={setQuery} />
      <CommandList>
        {!searching && <CommandEmpty>{t('command.searchHint')}</CommandEmpty>}
        {noMatches && <CommandEmpty>{t('command.empty')}</CommandEmpty>}

        {loading && (
          <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('command.searching')}
          </div>
        )}

        {!searching && (
          <CommandGroup heading={t('command.navigation')}>
            {NAV_ITEMS.filter((i) => i.enabled).map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.key}
                  value={t(`nav.${item.key}`)}
                  onSelect={() => go(item.href)}
                >
                  <Icon />
                  {t(`nav.${item.key}`)}
                </CommandItem>
              );
            })}
          </CommandGroup>
        )}

        {clients.length > 0 && (
          <CommandGroup heading={t('command.groupClients')}>
            {clients.map((c) => (
              <CommandItem
                key={c.id}
                value={`client-${c.id}`}
                onSelect={() => go(`/clients/${c.id}`)}
              >
                <Users />
                <span className="flex-1 truncate">{c.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{c.taxId}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {matters.length > 0 && (
          <CommandGroup heading={t('command.groupMatters')}>
            {matters.map((m) => (
              <CommandItem
                key={m.id}
                value={`matter-${m.id}`}
                onSelect={() => go(`/matters/${m.id}`)}
              >
                <Briefcase />
                <span className="flex-1 truncate">{m.title}</span>
                <span className="font-mono text-xs text-muted-foreground">{m.reference}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {documents.length > 0 && (
          <CommandGroup heading={t('command.groupDocuments')}>
            {documents.map((d) => (
              <CommandItem
                key={d.id}
                value={`document-${d.id}`}
                onSelect={() => go(`/matters/${d.matterId}/documents`)}
              >
                <FileText />
                <span className="flex-1 truncate">{d.name}</span>
                <span className="font-mono text-xs text-muted-foreground">{d.matterRef}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        {invoices.length > 0 && (
          <CommandGroup heading={t('command.groupInvoices')}>
            {invoices.map((i) => (
              <CommandItem
                key={i.id}
                value={`invoice-${i.id}`}
                onSelect={() => go(`/invoices/${i.id}`)}
              >
                <Receipt />
                <span className="flex-1 truncate font-mono">{i.number}</span>
                <span className="truncate text-xs text-muted-foreground">{i.clientName}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </>
  );
}

/** Hook simple para abrir/cerrar el command menu desde la topbar. */
export function useCommandMenu() {
  const [open, setOpen] = useState(false);
  return { open, setOpen };
}
