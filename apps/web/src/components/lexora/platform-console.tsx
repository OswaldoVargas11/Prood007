'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, ShieldCheck } from 'lucide-react';
import { getPlatformToken, platformApi, platformLogin, setPlatformToken } from '@/lib/platform';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import type { BadgeProps } from '@/components/ui/badge';
import type { PlatformTenant, SubscriptionStatusValue } from '@/lib/types';

function statusVariant(s: SubscriptionStatusValue): NonNullable<BadgeProps['variant']> {
  switch (s) {
    case 'ACTIVE':
      return 'success';
    case 'TRIALING':
      return 'info';
    case 'PAST_DUE':
      return 'warning';
    default:
      return 'danger';
  }
}

const inputCls =
  'h-9 w-20 rounded-md border bg-[var(--surface-1)] px-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring';

export function PlatformConsole() {
  const [authed, setAuthed] = useState<boolean>(() => Boolean(getPlatformToken()));
  if (!authed) return <PlatformLogin onAuthed={() => setAuthed(true)} />;
  return <Console onLogout={() => setAuthed(false)} />;
}

function PlatformLogin({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const login = useMutation({
    mutationFn: () => platformLogin(email, password),
    onSuccess: onAuthed,
    onError: () => setError('Credenciales inválidas.'),
  });

  return (
    <div className="mx-auto mt-24 max-w-sm space-y-4 rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-[var(--brand)]" />
        <h1 className="text-lg font-semibold">Consola de plataforma</h1>
      </div>
      <p className="text-sm text-muted-foreground">Acceso del administrador de Lawzora.</p>
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          setError(null);
          login.mutate();
        }}
      >
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="flex h-10 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="flex h-10 w-full rounded-md border bg-[var(--surface-1)] px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
        {error && <p className="text-sm text-[var(--danger)]">{error}</p>}
        <Button type="submit" className="w-full" disabled={login.isPending}>
          {login.isPending && <Loader2 className="animate-spin" />}
          Entrar
        </Button>
      </form>
    </div>
  );
}

function Console({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['platform', 'tenants'],
    queryFn: platformApi.listTenants,
    retry: false,
  });
  if (isError) {
    setPlatformToken(null);
  }

  const invalidate = () => qc.invalidateQueries({ queryKey: ['platform', 'tenants'] });

  return (
    <div className="mx-auto max-w-[1400px] space-y-4 p-4 sm:p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Despachos</h1>
          <p className="text-sm text-muted-foreground">
            {data
              ? `${data.length} despachos · gestiona prueba, plazas y suscripción.`
              : 'Cargando…'}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setPlatformToken(null);
            onLogout();
          }}
        >
          Salir
        </Button>
      </div>

      {isLoading && <Skeleton className="h-64 w-full rounded-xl" />}
      {isError && <p className="text-sm text-[var(--danger)]">Sesión caducada. Vuelve a entrar.</p>}

      {data && (
        <div className="overflow-x-auto rounded-xl border bg-card shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Despacho</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2">Plazas</th>
                <th className="px-3 py-2">Prueba</th>
                <th className="px-3 py-2">€/mes</th>
                <th className="px-3 py-2">Datos</th>
                <th className="px-3 py-2 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {data.map((t) => (
                <TenantRow key={t.id} t={t} onChanged={invalidate} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TenantRow({ t, onChanged }: { t: PlatformTenant; onChanged: () => void }) {
  const [seats, setSeats] = useState<number>(t.seats || t.seatsUsed || 1);
  const mut = useMutation({
    mutationFn: (fn: () => Promise<unknown>) => fn(),
    onSuccess: onChanged,
  });

  const suspended = t.status === 'SUSPENDED' || t.status === 'CANCELED';

  return (
    <tr className="align-middle">
      <td className="px-3 py-2">
        <div className="font-medium">{t.name}</div>
        <div className="text-[11px] uppercase text-[var(--text-subtle)]">{t.jurisdiction}</div>
      </td>
      <td className="px-3 py-2">
        <Badge variant={statusVariant(t.status)}>{t.status}</Badge>
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {t.seatsUsed} / {t.seats || t.seatCap}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">
        {t.trialDaysLeft != null ? `${t.trialDaysLeft} d` : '—'}
      </td>
      <td className="px-3 py-2 whitespace-nowrap">€{t.monthlyTotalEur}</td>
      <td className="px-3 py-2 whitespace-nowrap text-[var(--text-subtle)]">
        {t.clients} cli · {t.matters} exp
      </td>
      <td className="px-3 py-2">
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          <Button
            size="sm"
            variant="outline"
            disabled={mut.isPending}
            onClick={() => mut.mutate(() => platformApi.extendTrial(t.id, 15))}
          >
            +15d prueba
          </Button>
          <input
            type="number"
            min={1}
            value={seats}
            onChange={(e) => setSeats(Math.max(1, Number(e.target.value) || 1))}
            className={inputCls}
            title="Plazas"
          />
          <Button
            size="sm"
            disabled={mut.isPending}
            onClick={() => mut.mutate(() => platformApi.setSubscription(t.id, 'ACTIVE', seats))}
          >
            Activar
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={mut.isPending}
            onClick={() =>
              mut.mutate(() =>
                platformApi.setSubscription(t.id, suspended ? 'ACTIVE' : 'SUSPENDED'),
              )
            }
          >
            {suspended ? 'Reactivar' : 'Suspender'}
          </Button>
        </div>
      </td>
    </tr>
  );
}
