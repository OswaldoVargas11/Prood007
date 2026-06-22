'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Download, FileText, Loader2, Lock, ShieldCheck } from 'lucide-react';
import {
  useAskExternalDataRoomQuestion,
  useExternalDataRoom,
  useExternalDataRoomQuestions,
} from '@/lib/hooks';
import { api } from '@/lib/api';
import { formatBytes } from '@/lib/doc-status';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';

async function downloadExternal(token: string, docId: string, filename: string) {
  const blob = await api.download(`/data-rooms/external/${token}/documents/${docId}/download`);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function DataRoomViewerPage() {
  const params = useParams();
  const token = String(params.token ?? '');
  const t = useTranslations('dataRoomExternal');
  const { data: room, isLoading, isError } = useExternalDataRoom(token);
  const { data: qData } = useExternalDataRoomQuestions(token);
  const ask = useAskExternalDataRoomQuestion(token);
  const [folder, setFolder] = useState<string | 'ALL'>('ALL');
  const [question, setQuestion] = useState('');

  const docs = useMemo(() => {
    if (!room) return [];
    return folder === 'ALL' ? room.documents : room.documents.filter((d) => d.folderId === folder);
  }, [room, folder]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 p-6">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  if (isError || !room) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center gap-3 p-12 text-center">
        <Lock className="size-8 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">{t('invalid')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6">
      <header className="space-y-1">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-[var(--brand)]" />
          <h1 className="text-xl font-semibold">{room.name}</h1>
        </div>
        <p className="text-sm text-muted-foreground">
          {t('viewerAs', { email: room.viewer.email })}
        </p>
        <p className="text-xs text-muted-foreground">
          {room.canDownload && room.watermark ? t('watermarkNote') : null}
          {!room.canDownload ? t('viewOnlyNote') : null}
        </p>
      </header>

      {/* Filtro por carpeta */}
      {room.folders.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFolder('ALL')}
            className={`rounded-full border px-3 py-1 text-xs ${folder === 'ALL' ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-muted-foreground'}`}
          >
            {t('allDocuments')}
          </button>
          {room.folders.map((f) => (
            <button
              key={f.id}
              onClick={() => setFolder(f.id)}
              className={`rounded-full border px-3 py-1 text-xs ${folder === f.id ? 'border-[var(--brand)] bg-[var(--brand-soft)] text-[var(--brand-strong)]' : 'text-muted-foreground'}`}
            >
              {f.name}
            </button>
          ))}
        </div>
      )}

      {/* Documentos */}
      <Card>
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {docs.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <FileText className="size-4 text-[var(--brand)]" />
                <span className="min-w-0 flex-1 truncate">{d.name}</span>
                <span className="hidden text-xs text-muted-foreground sm:inline">
                  {formatBytes(d.sizeBytes)}
                </span>
                {room.canDownload && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => downloadExternal(token, d.id, d.name)}
                  >
                    <Download className="size-4" /> {t('download')}
                  </Button>
                )}
              </div>
            ))}
            {docs.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                {t('noDocuments')}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Q&A */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold">{t('ask')}</h2>
        <div className="flex gap-2">
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={t('askPlaceholder')}
          />
          <Button
            className="shrink-0"
            disabled={!question.trim() || ask.isPending}
            onClick={() =>
              ask.mutate({ body: question.trim() }, { onSuccess: () => setQuestion('') })
            }
          >
            {ask.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            {t('send')}
          </Button>
        </div>

        <h3 className="pt-2 text-sm font-semibold">{t('myQuestions')}</h3>
        {!qData?.questions.length ? (
          <p className="text-xs text-muted-foreground">{t('noQuestions')}</p>
        ) : (
          <div className="space-y-2">
            {qData.questions.map((q) => (
              <div key={q.id} className="rounded-md border p-3 text-sm">
                <div className="flex items-center justify-between">
                  <span className="font-medium">{q.body}</span>
                  <Badge variant={q.status === 'ANSWERED' ? 'default' : 'outline'}>
                    {q.status === 'ANSWERED' ? t('answered') : t('pending')}
                  </Badge>
                </div>
                {q.answer && (
                  <p className="mt-2 rounded bg-[var(--surface-2)] p-2 text-xs">{q.answer}</p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      <footer className="pt-4 text-center text-xs text-muted-foreground">{t('poweredBy')}</footer>
    </div>
  );
}
