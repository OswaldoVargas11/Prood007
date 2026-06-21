'use client';

import { useTranslations } from 'next-intl';
import { ExternalLink, Scale } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import type { MatterDetail } from '@/lib/types';

/** Términos de búsqueda derivados del expediente (título + parte contraria + nº de procedimiento). */
function buildQuery(matter: MatterDetail): string {
  return [matter.title, matter.opposingParty, matter.caseNumber].filter(Boolean).join(' ').trim();
}

/** Búsqueda acotada a un portal vía Google (deep-link fiable aunque el portal no exponga búsqueda por URL). */
function siteSearch(site: string, query: string): string {
  return `https://www.google.com/search?q=${encodeURIComponent(`site:${site} ${query}`)}`;
}

/**
 * Enlaces de investigación jurídica desde el expediente, con los términos del caso ya cargados. Por
 * jurisdicción: ES (CENDOJ/BOE/vLex) · RD (Poder Judicial/DGII/vLex). Abre en pestaña nueva.
 */
export function LegalResearchLinks({ matter }: { matter: MatterDetail }) {
  const t = useTranslations('matters.research');
  const { user } = useAuth();
  const query = buildQuery(matter);
  const isDO = user?.jurisdiction === 'do';

  const links = isDO
    ? [
        { label: 'Poder Judicial RD', href: siteSearch('poderjudicial.gob.do', query) },
        { label: 'DGII', href: siteSearch('dgii.gov.do', query) },
        { label: 'vLex', href: `https://vlex.com.do/search?q=${encodeURIComponent(query)}` },
      ]
    : [
        { label: 'Jurisprudencia (CENDOJ)', href: siteSearch('poderjudicial.es', query) },
        { label: 'Legislación (BOE)', href: siteSearch('boe.es', query) },
        { label: 'vLex', href: `https://vlex.es/search?q=${encodeURIComponent(query)}` },
      ];

  return (
    <div className="rounded-xl border bg-card p-4 shadow-sm">
      <div className="mb-2 flex items-center gap-2">
        <Scale className="size-4 text-[var(--brand)]" />
        <span className="text-[13px] font-semibold">{t('title')}</span>
      </div>
      <p className="mb-2.5 text-[11.5px] text-[var(--text-subtle)]">{t('hint')}</p>
      <div className="flex flex-col gap-1.5">
        {links.map((l) => (
          <a
            key={l.label}
            href={l.href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-between rounded-[10px] border px-3 py-2 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            {l.label}
            <ExternalLink className="size-3.5" />
          </a>
        ))}
      </div>
    </div>
  );
}
