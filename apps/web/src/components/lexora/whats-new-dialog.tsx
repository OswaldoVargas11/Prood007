'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Sparkles } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CURRENT_VERSION, RELEASES, type Release } from '@/lib/releases';

const STORAGE_KEY = 'lawzora.lastSeenVersion';

/**
 * Aviso de "Novedades" tras iniciar sesión. Compara la última versión vista (localStorage) con la
 * actual y muestra los cambios de las versiones intermedias. Para usuarios nuevos muestra solo la
 * última (a modo de bienvenida) una vez. Al cerrarlo, marca la versión actual como vista.
 */
export function WhatsNewDialog() {
  const t = useTranslations('whatsNew');
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Release[]>([]);

  useEffect(() => {
    let lastSeen: string | null = null;
    try {
      lastSeen = localStorage.getItem(STORAGE_KEY);
    } catch {
      lastSeen = null;
    }
    if (lastSeen === CURRENT_VERSION) return;

    const idx = lastSeen ? RELEASES.findIndex((r) => r.version === lastSeen) : -1;
    // idx === -1 → no hay versión vista conocida: mostramos solo la última. Si la hay, mostramos las
    // publicadas después (las que están por encima en la lista, ordenada de nueva a antigua).
    const toShow = idx === -1 ? RELEASES.slice(0, 1) : RELEASES.slice(0, idx);
    if (toShow.length === 0) {
      try {
        localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
      } catch {
        /* almacenamiento no disponible: no bloquea */
      }
      return;
    }
    setItems(toShow);
    setOpen(true);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(STORAGE_KEY, CURRENT_VERSION);
    } catch {
      /* almacenamiento no disponible: no bloquea */
    }
    setOpen(false);
  }

  if (!items.length) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-[var(--brand)]" />
            {t('title')}
          </DialogTitle>
          <DialogDescription>{t('subtitle', { version: CURRENT_VERSION })}</DialogDescription>
        </DialogHeader>
        <div className="max-h-[50vh] space-y-4 overflow-y-auto">
          {items.map((r) => (
            <div key={r.version} className="space-y-2">
              <div className="text-sm font-semibold">
                v{r.version} · {r.date}
              </div>
              <ul className="space-y-1.5 text-sm">
                {r.highlights.map((h, i) => (
                  <li key={i} className="flex gap-2">
                    <span className="text-[var(--brand)]">•</span>
                    <span>{h}</span>
                  </li>
                ))}
              </ul>
              {/* Correcciones contadas en superficie. */}
              {r.fixes && r.fixes.length > 0 && (
                <div className="space-y-1 pt-1">
                  <div className="text-[12px] font-medium text-muted-foreground">
                    {t('fixesTitle')}
                  </div>
                  <ul className="space-y-1 text-[13px] text-muted-foreground">
                    {r.fixes.map((f, i) => (
                      <li key={i} className="flex gap-2">
                        <span>·</span>
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {/* Cambios técnicos resumidos en una línea (no se detallan al usuario). */}
              {r.improvements && (
                <p className="text-[13px] text-muted-foreground">{r.improvements}</p>
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={dismiss}>{t('gotIt')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
