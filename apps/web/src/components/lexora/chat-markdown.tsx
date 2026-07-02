import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentPropsWithoutRef } from 'react';
import type { Citation } from '@/lib/types';

/**
 * Renderiza el Markdown que devuelve el agente de IA (encabezados, negritas, listas, tablas, código,
 * separadores) en burbujas de chat compactas. Estilado a mano con tokens del tema (claro/oscuro) en vez
 * del plugin `prose`, que deja demasiado aire para una burbuja pequeña. Solo para mensajes del asistente
 * (los del usuario son texto plano). GFM habilita tablas, tachado y checkboxes.
 *
 * CITAS: si se pasan `citations`, los marcadores `[n]` cuya cita existe se convierten en enlaces internos
 * `cite:n` (antes del parseo Markdown) y se pintan como chips clicables que abren la fuente (`onCite`).
 */
export function ChatMarkdown({
  content,
  citations,
  onCite,
}: {
  content: string;
  citations?: Citation[];
  onCite?: (c: Citation) => void;
}) {
  const hasCites = Boolean(citations?.length);
  // Transforma [n] → [n](cite:n) SOLO cuando existe esa cita, para que Markdown lo trate como enlace.
  const source = hasCites
    ? content.replace(/\[(\d+)\]/g, (m, d: string) =>
        citations!.some((c) => c.n === Number(d)) ? `[${d}](cite:${d})` : m,
      )
    : content;
  return (
    <div className="space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        // El sanitizador por defecto solo permite http/https/irc/ircs/mailto/xmpp: sin esto, `cite:n`
        // llega al renderer como href="" y el chip de cita queda muerto (enlace vacío, panel sin abrir).
        urlTransform={(url) => (url.startsWith('cite:') ? url : defaultUrlTransform(url))}
        components={{
          h1: (p) => <h1 className="mb-1 mt-3 text-[15px] font-semibold" {...p} />,
          h2: (p) => <h2 className="mb-1 mt-3 text-[14px] font-semibold" {...p} />,
          h3: (p) => <h3 className="mb-1 mt-2 text-[13px] font-semibold" {...p} />,
          p: (p) => <p className="my-2" {...p} />,
          ul: (p) => <ul className="my-2 list-disc space-y-0.5 pl-4" {...p} />,
          ol: (p) => <ol className="my-2 list-decimal space-y-0.5 pl-4" {...p} />,
          li: (p) => <li className="leading-snug" {...p} />,
          strong: (p) => <strong className="font-semibold" {...p} />,
          hr: () => <hr className="my-2 border-[var(--border)]" />,
          a: ({ href, children, ...p }: ComponentPropsWithoutRef<'a'>) => {
            // Cita interna: chip clicable que abre la fuente en el panel lateral (respetando permisos).
            if (href?.startsWith('cite:')) {
              const n = Number(href.slice(5));
              const c = citations?.find((x) => x.n === n);
              return (
                <button
                  type="button"
                  onClick={() => c && onCite?.(c)}
                  className="mx-0.5 inline-flex items-center rounded bg-[var(--brand-soft)] px-1 align-super text-[10px] font-semibold leading-tight text-[var(--brand)] hover:underline"
                  aria-label={c ? `Ver fuente: ${c.label}` : `Cita ${n}`}
                >
                  {n}
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[var(--brand)] underline underline-offset-2"
                {...p}
              >
                {children}
              </a>
            );
          },
          blockquote: (p) => (
            <blockquote
              className="my-2 border-l-2 border-[var(--border)] pl-2 italic opacity-90"
              {...p}
            />
          ),
          code: ({ className, children, ...p }: ComponentPropsWithoutRef<'code'>) => {
            const isBlock = (className ?? '').includes('language-');
            if (isBlock) {
              return (
                <code className={`block ${className ?? ''}`} {...p}>
                  {children}
                </code>
              );
            }
            return (
              <code
                className="rounded bg-black/10 px-1 py-0.5 text-[0.85em] dark:bg-white/15"
                {...p}
              >
                {children}
              </code>
            );
          },
          pre: (p) => (
            <pre
              className="my-2 overflow-x-auto rounded-md bg-zinc-900 p-2 text-[12px] text-zinc-100"
              {...p}
            />
          ),
          table: (p) => (
            <div className="my-2 overflow-x-auto">
              <table className="w-full border-collapse text-[12px]" {...p} />
            </div>
          ),
          th: (p) => (
            <th
              className="border border-[var(--border)] px-2 py-1 text-left font-semibold"
              {...p}
            />
          ),
          td: (p) => <td className="border border-[var(--border)] px-2 py-1" {...p} />,
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}
