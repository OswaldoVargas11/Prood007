'use client';

import {
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

/** Paleta de gráficos (tokens del tema, claro/oscuro). */
const CHART_VARS = [
  'var(--chart-1)',
  'var(--chart-2)',
  'var(--chart-3)',
  'var(--chart-4)',
  'var(--chart-5)',
];

export interface Slice {
  label: string;
  value: number;
}

const TOOLTIP_STYLE = {
  background: 'var(--card)',
  border: '1px solid var(--border)',
  borderRadius: 8,
  fontSize: 12,
  color: 'var(--foreground)',
} as const;

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex h-[180px] items-center justify-center text-[12.5px] text-muted-foreground">
      {message}
    </div>
  );
}

/** Leyenda compacta bajo el gráfico. */
function Legend({ data }: { data: Slice[] }) {
  return (
    <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {data.map((d, i) => (
        <li key={d.label} className="flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span
            className="size-2.5 rounded-[3px]"
            style={{ background: CHART_VARS[i % CHART_VARS.length] }}
          />
          {d.label}
          <span className="font-semibold text-foreground tabular-nums">{d.value}</span>
        </li>
      ))}
    </ul>
  );
}

/** Pastel o donut (innerRadius) para datos categóricos. */
export function CategoryPie({
  data,
  donut = false,
  emptyMessage,
}: {
  data: Slice[];
  donut?: boolean;
  emptyMessage: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <EmptyChart message={emptyMessage} />;
  return (
    <div>
      <ResponsiveContainer width="100%" height={180}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius={donut ? 48 : 0}
            outerRadius={72}
            paddingAngle={2}
            stroke="none"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={CHART_VARS[i % CHART_VARS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </PieChart>
      </ResponsiveContainer>
      <Legend data={data} />
    </div>
  );
}

/** Barras horizontales para rankings (sector, carga por letrado). */
export function CategoryBars({ data, emptyMessage }: { data: Slice[]; emptyMessage: string }) {
  if (data.length === 0 || data.every((d) => d.value === 0)) {
    return <EmptyChart message={emptyMessage} />;
  }
  return (
    <ResponsiveContainer width="100%" height={Math.max(140, data.length * 34)}>
      <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis
          type="category"
          dataKey="label"
          width={120}
          tick={{ fontSize: 12, fill: 'var(--muted-foreground)' }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip cursor={{ fill: 'var(--surface-2)' }} contentStyle={TOOLTIP_STYLE} />
        <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={22}>
          {data.map((_, i) => (
            <Cell key={i} fill={CHART_VARS[i % CHART_VARS.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
