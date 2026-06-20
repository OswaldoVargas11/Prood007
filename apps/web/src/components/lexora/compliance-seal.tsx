import { FileCheck2, Landmark, Link2 } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Sello de cumplimiento fiscal — el "foso" de Lawzora, reutilizado en el héroe-diferenciador de la
 * landing y en el detalle de factura de la app. Muestra el registro encadenado + código de cotejo
 * (QR/eNCF) + régimen, con la familia de tokens `--seal*` (cobre). Datos ilustrativos (presentación).
 *
 * `regime`:
 *  - 'verifactu' → España · AEAT · QR de cotejo + huella encadenada
 *  - 'ecf'       → R. Dominicana · DGII · eNCF + código de seguridad
 */
const REGIMES = {
  verifactu: {
    title: 'Verifactu',
    authority: 'AEAT',
    country: 'España',
    codeLabel: 'QR de cotejo',
    code: 'VF-7K3Q-9MX2-A4D8',
    chainLabel: 'Huella encadenada',
    chain: 'a3f9…c20e ← 8b1d…77af',
  },
  ecf: {
    title: 'e-CF',
    authority: 'DGII',
    country: 'R. Dominicana',
    codeLabel: 'eNCF',
    code: 'E310000000042',
    chainLabel: 'Código de seguridad',
    chain: 'k9P2mQ',
  },
} as const;

export function ComplianceSeal({
  regime,
  className,
}: {
  regime: 'verifactu' | 'ecf';
  className?: string;
}) {
  const r = REGIMES[regime];
  return (
    <div
      className={cn(
        'flex flex-col gap-3 rounded-xl border p-4',
        'border-[var(--seal-line)] bg-[var(--seal-soft)]',
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-[var(--seal-strong)]">
          <FileCheck2 className="size-4" /> {r.title}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-muted-foreground">
          <Landmark className="size-3.5" /> {r.authority} · {r.country}
        </span>
      </div>

      <div className="flex items-center gap-3">
        {/* Código de cotejo: QR estilizado (presentación) */}
        <div
          aria-hidden
          className="size-16 shrink-0 rounded-md border border-[var(--seal-line)] bg-[var(--surface-1)]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(45deg, var(--seal-line) 0, var(--seal-line) 2px, transparent 2px, transparent 5px)',
          }}
        />
        <div className="min-w-0">
          <div className="text-[10.5px] font-medium uppercase tracking-wide text-muted-foreground">
            {r.codeLabel}
          </div>
          <div className="truncate font-mono text-[12.5px] font-medium tabular-nums">{r.code}</div>
        </div>
      </div>

      <div className="flex items-start gap-1.5 border-t border-[var(--seal-line)] pt-2.5 text-[11.5px] text-muted-foreground">
        <Link2 className="mt-px size-3.5 shrink-0 text-[var(--seal-strong)]" />
        <span>
          <span className="font-medium text-foreground">{r.chainLabel}:</span>{' '}
          <span className="font-mono">{r.chain}</span>
        </span>
      </div>
    </div>
  );
}
