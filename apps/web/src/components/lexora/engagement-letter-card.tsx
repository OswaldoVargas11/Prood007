'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { FileSignature, Loader2 } from 'lucide-react';
import { useEngagementLetter, useSaveEngagementLetter } from '@/lib/hooks';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

export function EngagementLetterCard({ matterId }: { matterId: string }) {
  const t = useTranslations('engagement');
  const { data: letter, isLoading } = useEngagementLetter(matterId);
  const save = useSaveEngagementLetter(matterId);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState('');
  const [fees, setFees] = useState('');
  const [terms, setTerms] = useState('');

  // Precarga los campos al abrir el editor con lo ya guardado.
  useEffect(() => {
    if (letter) {
      setScope(letter.scope);
      setFees(letter.fees);
      setTerms(letter.terms);
    }
  }, [letter]);

  if (isLoading) return null;

  const submit = () => {
    save.mutate(
      { scope: scope.trim(), fees: fees.trim(), terms: terms.trim() },
      { onSuccess: () => setOpen(false) },
    );
  };

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileSignature className="size-4 text-[var(--brand)]" />
            <span className="font-medium">{t('title')}</span>
            {letter ? (
              <Badge variant="outline">{t(`status.${letter.status}`)}</Badge>
            ) : (
              <Badge variant="secondary">{t('notSet')}</Badge>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setOpen((o) => !o)}>
            {letter ? t('edit') : t('create')}
          </Button>
        </div>

        {!open && letter && <p className="text-xs text-muted-foreground">{t('generatedHint')}</p>}
        {!open && !letter && <p className="text-xs text-muted-foreground">{t('intro')}</p>}

        {open && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="el-scope">{t('scope')}</Label>
              <Textarea
                id="el-scope"
                rows={3}
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                placeholder={t('scopePlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="el-fees">{t('fees')}</Label>
              <Textarea
                id="el-fees"
                rows={2}
                value={fees}
                onChange={(e) => setFees(e.target.value)}
                placeholder={t('feesPlaceholder')}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="el-terms">{t('terms')}</Label>
              <Textarea
                id="el-terms"
                rows={3}
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder={t('termsPlaceholder')}
              />
            </div>
            {save.isError && <p className="text-sm text-[var(--danger)]">{t('error')}</p>}
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
                {t('cancel')}
              </Button>
              <Button
                size="sm"
                disabled={!scope.trim() || !fees.trim() || !terms.trim() || save.isPending}
                onClick={submit}
              >
                {save.isPending && <Loader2 className="size-4 animate-spin" />}
                {t('generate')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('signHint')}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
