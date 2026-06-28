'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';

interface LegalDoc {
  id: string;
  type: string;
  title: string;
  version: string;
}

function hrefFor(type: string): string {
  return type === 'PRIVACY' ? '/privacy' : '/terms';
}

/**
 * Gate de aceptación legal (clickwrap). Tras iniciar sesión, comprueba `/legal/must-accept` (documentos
 * obligatorios que el usuario nunca aceptó, p. ej. el DPA para un despacho previo a esta capa). Si los hay,
 * bloquea con una pantalla de aceptación. FAIL-OPEN: cualquier error de red NO bloquea la app. No fuerza
 * re-aceptar por cambios menores de versión (rige "uso continuado"); eso lo decide el backend.
 */
export function LegalGate() {
  const [docs, setDocs] = useState<LegalDoc[] | null>(null);
  const [checked, setChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let active = true;
    api
      .get<LegalDoc[]>('/legal/must-accept')
      .then((d) => active && setDocs(d))
      .catch(() => active && setDocs([])); // fail-open: no bloquear ante error
    return () => {
      active = false;
    };
  }, []);

  if (!docs || docs.length === 0) return null;

  async function accept() {
    setSubmitting(true);
    try {
      await api.post('/legal/accept', {
        items: docs!.map((d) => ({ documentId: d.id, act: 'RE_ACCEPTANCE' })),
        shownSnapshot: { source: 'gate', documents: docs!.map((d) => `${d.type}@${d.version}`) },
      });
      setDocs([]);
    } catch {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-6 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-[var(--shadow-md)]">
        <h2 className="text-lg font-semibold tracking-tight">Actualización de condiciones</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          Para seguir usando Lawzora, revisa y acepta los siguientes documentos.
        </p>
        <ul className="mt-4 space-y-1.5 text-sm">
          {docs.map((d) => (
            <li key={d.id}>
              <Link
                href={hrefFor(d.type)}
                target="_blank"
                className="font-medium text-[var(--brand)] underline underline-offset-2"
              >
                {d.title}
              </Link>
            </li>
          ))}
        </ul>
        <label className="mt-5 flex cursor-pointer items-start gap-2.5">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 size-4 flex-shrink-0 accent-[var(--brand)]"
          />
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">
            He leído y acepto los documentos anteriores.
          </span>
        </label>
        <button
          type="button"
          onClick={accept}
          disabled={!checked || submitting}
          className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--brand)] px-6 py-2.5 text-[13.5px] font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting && <Loader2 className="size-4 animate-spin" />}
          Aceptar y continuar
        </button>
      </div>
    </div>
  );
}
