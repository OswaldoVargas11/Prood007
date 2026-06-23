import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TaskStatus } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { decryptBlob, encryptBlob, loadEncryptionKey } from '../storage/storage-crypto';
import type { RequestUser } from '../auth/auth.types';

const OPEN = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];
const PROVIDER = 'microsoft';
// Identidad + Outlook Calendar + correo (enviar y leer para adjuntar) + ficheros (OneDrive + SharePoint).
// offline_access → refresh token. Files.Read = OneDrive del usuario (sin consentimiento de admin).
// Sites.Read.All = bibliotecas de SharePoint; en muchos tenants exige consentimiento de un administrador
// (una sola vez). Ninguno es "restringido" al estilo CASA de Google.
const SCOPES = [
  'openid',
  'email',
  'offline_access',
  'https://graph.microsoft.com/Calendars.ReadWrite',
  'https://graph.microsoft.com/Mail.Send',
  'https://graph.microsoft.com/Mail.Read',
  'https://graph.microsoft.com/Files.Read',
  'https://graph.microsoft.com/Sites.Read.All',
];
const GRAPH_ROOT = 'https://graph.microsoft.com/v1.0';
const GRAPH = `${GRAPH_ROOT}/me`;

/** Una entrada (carpeta o fichero) del explorador de OneDrive/SharePoint que ve el navegador. */
export interface CloudEntry {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType: string | null;
  sizeBytes: number | null;
  driveId: string | null;
}
// Propiedad extendida para marcar el evento con el id de la tarea (idempotencia del push de agenda).
const TASK_PROP = 'String {6f3b2e10-9a4c-4b8e-9c1d-000000000001} Name lawzoraTaskId';

/**
 * Integración Microsoft 365 (OAuth) — Outlook Calendar + correo, espejo de la de Google sobre Microsoft
 * Graph. GATED: si faltan MS_CLIENT_ID/SECRET/REDIRECT_URI o la clave de cifrado responde "no configurado".
 * Tokens cifrados (AES-256-GCM). El callback llega sin sesión → upsert con rol system; `state` firmado.
 */
@Injectable()
export class MicrosoftService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  private clientId = () => this.config.get<string>('MS_CLIENT_ID');
  private clientSecret = () => this.config.get<string>('MS_CLIENT_SECRET');
  private redirectUri = () => this.config.get<string>('MS_REDIRECT_URI');
  private msTenant = () => this.config.get<string>('MS_TENANT') ?? 'common';
  private key = () => loadEncryptionKey(this.config.get<string>('DATA_ENCRYPTION_KEY'));
  private secret = () => this.config.getOrThrow<string>('JWT_ACCESS_SECRET');

  private authBase = () =>
    `https://login.microsoftonline.com/${this.msTenant()}/oauth2/v2.0/authorize`;
  private tokenBase = () =>
    `https://login.microsoftonline.com/${this.msTenant()}/oauth2/v2.0/token`;

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.redirectUri() && this.key());
  }
  private assertConfigured() {
    if (!this.isConfigured())
      throw new NotImplementedException({
        messageKey: 'integrations.notConfigured',
        message: 'La integración con Microsoft no está configurada en el servidor.',
      });
  }

  // ── Cifrado de tokens ────────────────────────────────────────────────────────
  private enc(s: string): string {
    return encryptBlob(this.key()!, Buffer.from(s, 'utf8')).toString('base64');
  }
  private dec(b64: string): string {
    return decryptBlob(this.key()!, Buffer.from(b64, 'base64')).toString('utf8');
  }

  // ── State firmado ─────────────────────────────────────────────────────────────
  private signState(user: RequestUser): string {
    const payload = Buffer.from(
      JSON.stringify({ u: user.userId, t: user.tenantId, n: randomBytes(8).toString('hex') }),
    ).toString('base64url');
    const sig = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    return `${payload}.${sig}`;
  }
  private verifyState(state: string): { u: string; t: string } | null {
    const dot = state.lastIndexOf('.');
    if (dot <= 0) return null;
    const payload = state.slice(0, dot);
    const sig = state.slice(dot + 1);
    const expected = createHmac('sha256', this.secret()).update(payload).digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    try {
      const o = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
      return { u: o.u, t: o.t };
    } catch {
      return null;
    }
  }

  // ── Flujo OAuth ──────────────────────────────────────────────────────────────
  authUrl(user: RequestUser): { url: string } {
    this.assertConfigured();
    const params = new URLSearchParams({
      client_id: this.clientId()!,
      response_type: 'code',
      redirect_uri: this.redirectUri()!,
      response_mode: 'query',
      scope: SCOPES.join(' '),
      state: this.signState(user),
      prompt: 'consent',
    });
    return { url: `${this.authBase()}?${params.toString()}` };
  }

  async handleCallback(code: string, state: string): Promise<{ webRedirect: string }> {
    const appUrl = this.config.get<string>('APP_PUBLIC_URL') ?? 'https://lawzora.com';
    const st = this.verifyState(state);
    if (!st) return { webRedirect: `${appUrl}/es/settings?microsoft=error` };
    const res = await fetch(this.tokenBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId()!,
        client_secret: this.clientSecret()!,
        code,
        redirect_uri: this.redirectUri()!,
        grant_type: 'authorization_code',
        scope: SCOPES.join(' '),
      }),
    });
    if (!res.ok) return { webRedirect: `${appUrl}/es/settings?microsoft=error` };
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      scope?: string;
      id_token?: string;
    };
    const email = this.emailFromIdToken(tok.id_token);
    const expiresAt = tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null;
    await this.system.oAuthConnection.upsert({
      where: { userId_provider: { userId: st.u, provider: PROVIDER } },
      create: {
        tenantId: st.t,
        userId: st.u,
        provider: PROVIDER,
        externalEmail: email,
        scopes: tok.scope ?? SCOPES.join(' '),
        accessToken: this.enc(tok.access_token),
        refreshToken: tok.refresh_token ? this.enc(tok.refresh_token) : null,
        expiresAt,
      },
      update: {
        externalEmail: email,
        scopes: tok.scope ?? SCOPES.join(' '),
        accessToken: this.enc(tok.access_token),
        ...(tok.refresh_token ? { refreshToken: this.enc(tok.refresh_token) } : {}),
        expiresAt,
      },
    });
    return { webRedirect: `${appUrl}/es/settings?microsoft=connected` };
  }

  private emailFromIdToken(idToken?: string): string | null {
    if (!idToken) return null;
    try {
      const part = idToken.split('.')[1]!;
      const o = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
      return o.email ?? o.preferred_username ?? o.upn ?? null;
    } catch {
      return null;
    }
  }

  async status(user: RequestUser) {
    const conn = this.isConfigured()
      ? await this.prisma.oAuthConnection.findUnique({
          where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
          select: { externalEmail: true },
        })
      : null;
    return {
      configured: this.isConfigured(),
      connected: Boolean(conn),
      email: conn?.externalEmail ?? null,
    };
  }

  async disconnect(user: RequestUser) {
    await this.prisma.oAuthConnection.deleteMany({
      where: { userId: user.userId, provider: PROVIDER },
    });
    return { success: true };
  }

  private async accessTokenFor(userId: string): Promise<string> {
    const conn = await this.prisma.oAuthConnection.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER } },
    });
    if (!conn) throw new BadRequestException({ messageKey: 'integrations.notConnected' });
    const fresh = !conn.expiresAt || conn.expiresAt.getTime() > Date.now() + 60_000;
    if (fresh) return this.dec(conn.accessToken);
    if (!conn.refreshToken) return this.dec(conn.accessToken);
    const res = await fetch(this.tokenBase(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId()!,
        client_secret: this.clientSecret()!,
        refresh_token: this.dec(conn.refreshToken),
        grant_type: 'refresh_token',
        scope: SCOPES.join(' '),
      }),
    });
    if (!res.ok) return this.dec(conn.accessToken);
    const tok = (await res.json()) as {
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
    };
    await this.prisma.oAuthConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: this.enc(tok.access_token),
        ...(tok.refresh_token ? { refreshToken: this.enc(tok.refresh_token) } : {}),
        expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
      },
    });
    return tok.access_token;
  }

  // ── Calendar push (Lawzora → Outlook) ────────────────────────────────────────
  async syncCalendar(user: RequestUser): Promise<{ pushed: number; errors: number }> {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
    // Solo las tareas ASIGNADAS a este letrado (no todas las del despacho): cada agenda es la suya.
    const tasks = await this.prisma.task.findMany({
      where: {
        tenantId: user.tenantId,
        assigneeId: user.userId,
        status: { in: OPEN },
        dueDate: { not: null },
      },
      include: { matter: { select: { reference: true, client: { select: { name: true } } } } },
    });
    let pushed = 0;
    let errors = 0;
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const date = t.dueDate.toISOString().slice(0, 10);
      const end = new Date(t.dueDate.getTime() + 86_400_000).toISOString().slice(0, 10);
      const event = {
        subject: (t.isProcedural ? '⚖ ' : '') + (t.deadlineType || t.title),
        isAllDay: true,
        start: { dateTime: `${date}T00:00:00`, timeZone: 'UTC' },
        end: { dateTime: `${end}T00:00:00`, timeZone: 'UTC' },
        body: {
          contentType: 'Text',
          content: [t.matter?.reference, t.matter?.client?.name].filter(Boolean).join(' · '),
        },
        singleValueExtendedProperties: [{ id: TASK_PROP, value: t.id }],
      };
      try {
        // ¿Ya existe el evento de esta tarea? (filtro por la propiedad extendida) → PATCH, si no POST.
        const q = new URLSearchParams({
          $filter: `singleValueExtendedProperties/any(ep:ep/id eq '${TASK_PROP}' and ep/value eq '${t.id}')`,
          $select: 'id',
        });
        const found = await fetch(`${GRAPH}/events?${q.toString()}`, { headers });
        const existing = found.ok
          ? (((await found.json()) as { value?: { id: string }[] }).value ?? [])
          : [];
        const r = existing.length
          ? await fetch(`${GRAPH}/events/${existing[0]!.id}`, {
              method: 'PATCH',
              headers,
              body: JSON.stringify(event),
            })
          : await fetch(`${GRAPH}/events`, {
              method: 'POST',
              headers,
              body: JSON.stringify(event),
            });
        if (r.ok) pushed += 1;
        else errors += 1;
      } catch {
        errors += 1;
      }
    }
    return { pushed, errors };
  }

  // ── Correo (Outlook) ─────────────────────────────────────────────────────────
  async listRecentEmails(user: RequestUser) {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const q = new URLSearchParams({
      $top: '15',
      $select: 'id,subject,from,toRecipients,bodyPreview,receivedDateTime',
      $orderby: 'receivedDateTime desc',
    });
    const r = await fetch(`${GRAPH}/messages?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) return [];
    const msgs = ((await r.json()) as { value?: any[] }).value ?? [];
    return msgs.map((m) => ({
      externalId: m.id as string,
      from: m.from?.emailAddress?.address ?? '',
      to: m.toRecipients?.[0]?.emailAddress?.address ?? '',
      subject: m.subject ?? '',
      snippet: m.bodyPreview ?? '',
      date: m.receivedDateTime ?? '',
    }));
  }

  private async assertMatter(user: RequestUser, matterId: string) {
    const m = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!m) throw new BadRequestException({ messageKey: 'matters.notFound' });
  }

  async attachEmail(user: RequestUser, matterId: string, externalId: string) {
    this.assertConfigured();
    await this.assertMatter(user, matterId);
    const existing = await this.prisma.matterEmail.findFirst({
      where: { tenantId: user.tenantId, matterId, gmailId: externalId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, duplicate: true };
    const token = await this.accessTokenFor(user.userId);
    const q = new URLSearchParams({
      $select: 'subject,from,toRecipients,bodyPreview,receivedDateTime',
    });
    const r = await fetch(`${GRAPH}/messages/${encodeURIComponent(externalId)}?${q.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) throw new BadRequestException({ messageKey: 'integrations.gmailFetchFailed' });
    const m: any = await r.json();
    const sentAt = m.receivedDateTime ? new Date(m.receivedDateTime) : new Date();
    const created = await this.prisma.matterEmail.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        userId: user.userId,
        direction: 'IN',
        gmailId: externalId,
        fromAddr: m.from?.emailAddress?.address ?? '—',
        toAddr: m.toRecipients?.[0]?.emailAddress?.address ?? '—',
        subject: m.subject ?? null,
        snippet: m.bodyPreview ?? null,
        sentAt: isNaN(sentAt.getTime()) ? new Date() : sentAt,
      },
      select: { id: true },
    });
    return { id: created.id, duplicate: false };
  }

  async sendEmail(user: RequestUser, matterId: string, to: string, subject: string, body: string) {
    this.assertConfigured();
    await this.assertMatter(user, matterId);
    const token = await this.accessTokenFor(user.userId);
    const conn = await this.prisma.oAuthConnection.findUnique({
      where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
      select: { externalEmail: true },
    });
    const from = conn?.externalEmail ?? user.email;
    const r = await fetch(`${GRAPH}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: {
          subject,
          body: { contentType: 'Text', content: body },
          toRecipients: [{ emailAddress: { address: to } }],
        },
        saveToSentItems: true,
      }),
    });
    if (!r.ok) throw new BadRequestException({ messageKey: 'integrations.gmailSendFailed' });
    const created = await this.prisma.matterEmail.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        userId: user.userId,
        direction: 'OUT',
        fromAddr: from,
        toAddr: to,
        subject,
        snippet: body.slice(0, 200),
        sentAt: new Date(),
      },
      select: { id: true },
    });
    return { id: created.id };
  }

  // ── OneDrive / SharePoint (importar ficheros al expediente) ──────────────────
  /** ¿Está conectado este usuario? (para que el front muestre/oculte el explorador de ficheros). */
  async filesStatus(user: RequestUser) {
    const conn = this.isConfigured()
      ? await this.prisma.oAuthConnection.findUnique({
          where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
          select: { scopes: true },
        })
      : null;
    return {
      configured: this.isConfigured(),
      connected: Boolean(conn?.scopes?.includes('Files.Read')),
    };
  }

  private mapEntries(items: any[], fallbackDriveId: string | null): CloudEntry[] {
    return (items ?? []).map((i) => ({
      id: i.id as string,
      name: (i.name as string) ?? '—',
      isFolder: Boolean(i.folder),
      mimeType: i.file?.mimeType ?? null,
      sizeBytes: typeof i.size === 'number' ? i.size : null,
      driveId: i.parentReference?.driveId ?? fallbackDriveId,
    }));
  }

  /**
   * Lista carpetas+ficheros. Sin `driveId` → raíz del OneDrive del usuario. Con `driveId` → esa unidad
   * (p. ej. una biblioteca de SharePoint). `itemId` para entrar en una subcarpeta (si falta, la raíz).
   */
  async listFiles(
    user: RequestUser,
    opts: { driveId?: string; itemId?: string },
  ): Promise<CloudEntry[]> {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const headers = { Authorization: `Bearer ${token}` };
    const base = opts.driveId
      ? `${GRAPH_ROOT}/drives/${encodeURIComponent(opts.driveId)}`
      : `${GRAPH}/drive`;
    const node = opts.itemId ? `items/${encodeURIComponent(opts.itemId)}` : 'root';
    const q = '?$select=id,name,size,folder,file,parentReference&$top=200&$orderby=name';
    const r = await fetch(`${base}/${node}/children${q}`, { headers });
    if (!r.ok) throw new BadRequestException({ messageKey: 'integrations.cloudListFailed' });
    const value = ((await r.json()) as { value?: any[] }).value ?? [];
    return this.mapEntries(value, opts.driveId ?? null);
  }

  /** Busca sitios de SharePoint por texto; devuelve el id de la unidad (drive) de cada uno para navegar. */
  async searchSites(user: RequestUser, query: string) {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const headers = { Authorization: `Bearer ${token}` };
    const r = await fetch(`${GRAPH_ROOT}/sites?search=${encodeURIComponent(query)}&$top=25`, {
      headers,
    });
    if (!r.ok) throw new BadRequestException({ messageKey: 'integrations.cloudListFailed' });
    const sites = ((await r.json()) as { value?: any[] }).value ?? [];
    // Para cada sitio resolvemos su biblioteca por defecto (drive) — así el front navega con driveId.
    const out: { id: string; name: string; webUrl: string; driveId: string | null }[] = [];
    for (const s of sites) {
      let driveId: string | null = null;
      try {
        const dr = await fetch(`${GRAPH_ROOT}/sites/${s.id}/drive?$select=id`, { headers });
        if (dr.ok) driveId = ((await dr.json()) as { id?: string }).id ?? null;
      } catch {
        driveId = null;
      }
      out.push({
        id: s.id as string,
        name: (s.displayName as string) ?? (s.name as string) ?? '—',
        webUrl: (s.webUrl as string) ?? '',
        driveId,
      });
    }
    return out;
  }

  /** Descarga el contenido de un fichero de OneDrive/SharePoint elegido en el explorador. */
  async fetchDriveItem(
    user: RequestUser,
    driveId: string,
    itemId: string,
  ): Promise<{ buffer: Buffer; mimeType: string; filename: string; sizeBytes: number }> {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const headers = { Authorization: `Bearer ${token}` };
    const drive = encodeURIComponent(driveId);
    const item = encodeURIComponent(itemId);
    const metaRes = await fetch(
      `${GRAPH_ROOT}/drives/${drive}/items/${item}?$select=name,size,file`,
      { headers },
    );
    if (!metaRes.ok) throw new BadRequestException({ messageKey: 'integrations.cloudFetchFailed' });
    const meta = (await metaRes.json()) as {
      name: string;
      size?: number;
      file?: { mimeType?: string };
    };
    // /content responde 302 a una URL de descarga preautenticada en otro host; fetch sigue el redirect y
    // (por spec) NO reenvía la cabecera Authorization a otro origen, que es justo lo que necesita esa URL.
    const dl = await fetch(`${GRAPH_ROOT}/drives/${drive}/items/${item}/content`, { headers });
    if (!dl.ok) throw new BadRequestException({ messageKey: 'integrations.cloudFetchFailed' });
    const buffer = Buffer.from(await dl.arrayBuffer());
    return {
      buffer,
      mimeType: meta.file?.mimeType || 'application/octet-stream',
      filename: meta.name || 'documento',
      sizeBytes: buffer.length,
    };
  }
}
