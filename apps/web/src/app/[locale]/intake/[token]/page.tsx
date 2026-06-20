'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

function apiBase(): string {
  return process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
}

/**
 * Formulario PÚBLICO de captación (intake) del despacho. Lo abre un prospecto desde el enlace que el
 * despacho comparte. No requiere sesión; envía a `POST /api/public/intake/:token` (crea un lead).
 */
export default function IntakePage() {
  const { token } = useParams<{ token: string }>();
  const t = useTranslations('intake');
  const [firmName, setFirmName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [valid, setValid] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [subject, setSubject] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${apiBase()}/api/public/intake/${token}`);
        if (!res.ok) {
          setValid(false);
        } else {
          const d = (await res.json()) as { firmName: string };
          setFirmName(d.firmName);
        }
      } catch {
        setValid(false);
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function submit() {
    setError(false);
    setSending(true);
    try {
      const res = await fetch(`${apiBase()}/api/public/intake/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          subject: subject.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error();
      setSent(true);
    } catch {
      setError(true);
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-4 py-12">
      {loading ? (
        <div className="flex justify-center">
          <Loader2 className="size-6 animate-spin text-muted-foreground" />
        </div>
      ) : !valid ? (
        <div className="rounded-xl border bg-card p-8 text-center text-sm text-muted-foreground">
          {t('notFound')}
        </div>
      ) : sent ? (
        <div className="rounded-xl border bg-card p-8 text-center">
          <CheckCircle2 className="mx-auto size-10 text-[var(--success)]" />
          <h1 className="mt-3 text-lg font-semibold">{t('thanksTitle')}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t('thanksBody', { firm: firmName })}
          </p>
        </div>
      ) : (
        <div className="rounded-xl border bg-card p-6 shadow-sm">
          <h1 className="text-xl font-semibold tracking-tight">{t('title', { firm: firmName })}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t('subtitle')}</p>
          <form
            className="mt-5 space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim().length >= 2 && !sending) submit();
            }}
          >
            <div className="space-y-1.5">
              <Label>{t('name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} autoFocus />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t('email')}</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('phone')}</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('subjectField')}</Label>
              <Textarea
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                rows={4}
                placeholder={t('subjectPlaceholder')}
              />
            </div>
            {error && <p className="text-sm text-[var(--danger)]">{t('error')}</p>}
            <Button type="submit" className="w-full" disabled={name.trim().length < 2 || sending}>
              {sending && <Loader2 className="animate-spin" />}
              {t('send')}
            </Button>
            <p className="text-center text-[11px] text-muted-foreground">{t('privacy')}</p>
          </form>
        </div>
      )}
    </div>
  );
}
