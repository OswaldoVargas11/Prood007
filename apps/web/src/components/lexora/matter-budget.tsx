'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { toast } from 'sonner';
import { Wallet } from 'lucide-react';
import { useUpdateMatter } from '@/lib/hooks';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MatterDetail } from '@/lib/types';

/** Presupuesto de honorarios del expediente: importe objetivo vs consumido (valor del trabajo) + aviso. */
export function MatterBudget({ matter }: { matter: MatterDetail }) {
  const t = useTranslations('matterBudget');
  const locale = useLocale();
  const { user } = useAuth();
  const cur = user?.tenant?.currency ?? 'EUR';
  const update = useUpdateMatter(matter.id);
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(matter.budgetAmount ?? '');

  const budget = matter.budgetAmount ? Number(matter.budgetAmount) : null;
  const consumed = matter.budgetConsumed ?? 0;
  const pct = budget && budget > 0 ? Math.round((consumed / budget) * 100) : null;
  const over = pct != null && pct >= 100;
  const near = pct != null && pct >= 80 && pct < 100;

  async function save() {
    await update.mutateAsync({ budgetAmount: value });
    toast.success(t('saved'));
    setEditing(false);
  }
  async function clear() {
    await update.mutateAsync({ budgetAmount: '' });
    setValue('');
    toast.success(t('cleared'));
    setEditing(false);
  }

  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Wallet className="size-4 text-muted-foreground" /> {t('title')}
        </h3>
        {!editing && (
          <button
            type="button"
            onClick={() => {
              setValue(matter.budgetAmount ?? '');
              setEditing(true);
            }}
            className="text-[12px] font-medium text-[var(--brand)] hover:underline"
          >
            {budget != null ? t('edit') : t('set')}
          </button>
        )}
      </div>

      {editing ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Input
            value={value}
            inputMode="decimal"
            placeholder="0.00"
            onChange={(e) => setValue(e.target.value.replace(/[^\d.]/g, ''))}
            className="h-8 w-36"
          />
          <Button size="sm" onClick={save} disabled={update.isPending}>
            {t('save')}
          </Button>
          {budget != null && (
            <Button size="sm" variant="outline" onClick={clear} disabled={update.isPending}>
              {t('remove')}
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
            {t('cancel')}
          </Button>
        </div>
      ) : budget == null ? (
        <p className="mt-2 text-[13px] text-muted-foreground">{t('none')}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <div className="flex items-baseline justify-between text-[13px]">
            <span className="text-muted-foreground">{t('consumed')}</span>
            <span className="font-medium tabular-nums">
              {formatMoney(consumed, cur, locale)} / {formatMoney(budget, cur, locale)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${over ? 'bg-[var(--danger)]' : near ? 'bg-amber-500' : 'bg-[var(--brand)]'}`}
              style={{ width: `${Math.min(pct ?? 0, 100)}%` }}
            />
          </div>
          <div
            className={`text-[12px] ${over ? 'font-medium text-[var(--danger)]' : near ? 'text-amber-600' : 'text-muted-foreground'}`}
          >
            {pct}%{over ? ` · ${t('over')}` : near ? ` · ${t('near')}` : ''}
          </div>
        </div>
      )}
    </div>
  );
}
