'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { ChatMarkdown } from '@/components/lexora/chat-markdown';
import { Logo } from '@/components/lexora/logo';
import { Link } from '@/i18n/navigation';

interface Doc {
  title: string;
  version: string;
  body: string;
  effectiveFrom: string;
}

/**
 * Página pública de subprocesadores: renderiza el texto vigente del documento SUBPROCESSORS (art. 28.2 RGPD).
 * Cualquiera puede consultarla sin iniciar sesión.
 */
export default function SubprocessorsPage() {
  const [doc, setDoc] = useState<Doc | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    api
      .get<Doc>('/legal/public/subprocessors')
      .then(setDoc)
      .catch(() => setError(true));
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-3xl px-6 py-12">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/">
          <Logo size={26} />
        </Link>
        <Link
          href="/login"
          className="text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Iniciar sesión
        </Link>
      </header>

      {error && (
        <p className="text-sm text-muted-foreground">
          No se pudo cargar la lista de subprocesadores. Inténtalo de nuevo más tarde.
        </p>
      )}

      {doc && (
        <article>
          <div className="mb-6 border-b pb-4">
            <h1 className="text-2xl font-semibold tracking-tight">{doc.title}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              Versión {doc.version} · vigente desde{' '}
              {new Date(doc.effectiveFrom).toLocaleDateString('es-ES')}
            </p>
          </div>
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <ChatMarkdown content={doc.body} />
          </div>
        </article>
      )}
    </main>
  );
}
