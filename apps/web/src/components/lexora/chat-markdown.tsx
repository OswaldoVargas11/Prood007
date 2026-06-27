import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ComponentPropsWithoutRef } from 'react';

/**
 * Renderiza el Markdown que devuelve el agente de IA (encabezados, negritas, listas, tablas, código,
 * separadores) en burbujas de chat compactas. Estilado a mano con tokens del tema (claro/oscuro) en vez
 * del plugin `prose`, que deja demasiado aire para una burbuja pequeña. Solo para mensajes del asistente
 * (los del usuario son texto plano). GFM habilita tablas, tachado y checkboxes.
 */
export function ChatMarkdown({ content }: { content: string }) {
  return (
    <div className="space-y-2 text-sm leading-relaxed [&>*:first-child]:mt-0 [&>*:last-child]:mb-0">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
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
          a: ({ href, ...p }: ComponentPropsWithoutRef<'a'>) => (
            <a
              href={href}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-[var(--brand)] underline underline-offset-2"
              {...p}
            />
          ),
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
        {content}
      </ReactMarkdown>
    </div>
  );
}
