'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Briefcase, Loader2, Receipt, Users } from 'lucide-react';
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
import { useClients, useInvoices, useMatters } from '@/lib/hooks';

/** Quita acentos y baja a minúsculas para una comparación tolerante. */
function normalize(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Command bar (⌘K / Ctrl+K): navegación + búsqueda de clientes, expedientes y facturas. */
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

  // Las consultas solo se montan con el diálogo abierto. Filtramos en cliente sobre páginas amplias.
  const clientsQ = useClients({ pageSize: 100 });
  const mattersQ = useMatters({ pageSize: 100 });
  const invoicesQ = useInvoices();

  const q = normalize(debounced);
  const clients = useMemo(
    () =>
      !searching
        ? []
        : (clientsQ.data?.items ?? [])
            .filter((c) => normalize(`${c.name} ${c.taxId}`).includes(q))
            .slice(0, 6),
    [searching, clientsQ.data, q],
  );
  const matters = useMemo(
    () =>
      !searching
        ? []
        : (mattersQ.data?.items ?? [])
            .filter((m) =>
              normalize(`${m.reference} ${m.title} ${m.client?.name ?? ''}`).includes(q),
            )
            .slice(0, 6),
    [searching, mattersQ.data, q],
  );
  const invoices = useMemo(
    () =>
      !searching
        ? []
        : (invoicesQ.data ?? [])
            .filter((i) =>
              normalize(
                `${i.number} ${i.client?.name ?? ''} ${i.matter?.reference ?? ''}`,
              ).includes(q),
            )
            .slice(0, 6),
    [searching, invoicesQ.data, q],
  );

  const loading = searching && (clientsQ.isLoading || mattersQ.isLoading || invoicesQ.isLoading);
  const noMatches =
    searching && !loading && clients.length === 0 && matters.length === 0 && invoices.length === 0;

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
                <span className="truncate text-xs text-muted-foreground">
                  {i.client?.name ?? ''}
                </span>
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
