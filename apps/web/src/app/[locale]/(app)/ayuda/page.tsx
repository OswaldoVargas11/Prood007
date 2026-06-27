import { FEATURE_GUIDE, type FeatureGuideEntry } from '@legalflow/domain';
import { HelpCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Página de ayuda / documentación: explica cada función de Lawzora, dónde está en el menú y cómo usarla.
 * Comparte la fuente (`FEATURE_GUIDE` de @legalflow/domain) con la herramienta `how_to` del agente de IA,
 * para que la guía escrita y la del asistente sean siempre coherentes.
 */
export default function HelpPage() {
  const groups: { group: string; items: FeatureGuideEntry[] }[] = [];
  for (const e of FEATURE_GUIDE) {
    let g = groups.find((x) => x.group === e.group);
    if (!g) {
      g = { group: e.group, items: [] };
      groups.push(g);
    }
    g.items.push(e);
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start gap-3">
        <HelpCircle className="mt-1 size-6 shrink-0 text-[var(--brand)]" />
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Guía de Lawzora</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Qué hace cada función, dónde encontrarla en el menú y cómo usarla. ¿Prefieres preguntar?
            El asistente de IA (botón ✨ abajo a la derecha) también te guía paso a paso.
          </p>
        </div>
      </div>

      {groups.map((g) => (
        <section key={g.group} className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {g.group}
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {g.items.map((e) => (
              <Card key={e.id}>
                <CardContent className="space-y-2 p-4">
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold">{e.title}</h3>
                    <span className="shrink-0 rounded-full bg-[var(--surface-1)] px-2 py-0.5 text-[11px] text-muted-foreground">
                      {e.menu}
                    </span>
                  </div>
                  <p className="text-[13px] text-muted-foreground">{e.what}</p>
                  <ol className="list-decimal space-y-0.5 pl-4 text-[13px] leading-snug">
                    {e.steps.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ol>
                  {e.adminOnly && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400">
                      Solo administradores del despacho.
                    </p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
