import { BadRequestException, Injectable, NotImplementedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { TaskStatus } from '@legalflow/domain';
import { PrismaService, SystemPrismaService } from '../prisma/prisma.service';
import { decryptBlob, encryptBlob, loadEncryptionKey } from '../storage/storage-crypto';
import type { RequestUser } from '../auth/auth.types';

const OPEN = [TaskStatus.TODO, TaskStatus.IN_PROGRESS];
const PROVIDER = 'google';
// Identidad + Calendar (eventos) + Gmail (enviar y leer para adjuntar al expediente). Nota: gmail.readonly
// es scope "restringido" de Google → requiere verificación/usuarios de prueba; gmail.send es "sensible".
const SCOPES = [
  'openid',
  'email',
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/gmail.send',
  'https://www.googleapis.com/auth/gmail.readonly',
];
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const CAL_BASE = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
const GMAIL_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

/**
 * Integración Google (OAuth) — base compartida (Calendar ahora; Gmail después). GATED por configuración:
 * si faltan GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI o la clave de cifrado, los endpoints responden
 * "no configurado" y NO afecta a nada. Tokens cifrados en reposo (AES-256-GCM con DATA_ENCRYPTION_KEY).
 * El callback de Google llega sin sesión → upsert con el rol system; el `state` firmado porta el usuario.
 */
@Injectable()
export class GoogleService {
  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly system: SystemPrismaService,
  ) {}

  private clientId = () => this.config.get<string>('GOOGLE_CLIENT_ID');
  private clientSecret = () => this.config.get<string>('GOOGLE_CLIENT_SECRET');
  private redirectUri = () => this.config.get<string>('GOOGLE_REDIRECT_URI');
  private key = () => loadEncryptionKey(this.config.get<string>('DATA_ENCRYPTION_KEY'));
  private secret = () => this.config.get<string>('JWT_ACCESS_SECRET') ?? 'dev-secret';

  isConfigured(): boolean {
    return Boolean(this.clientId() && this.clientSecret() && this.redirectUri() && this.key());
  }
  private assertConfigured() {
    if (!this.isConfigured())
      throw new NotImplementedException({
        messageKey: 'integrations.notConfigured',
        message: 'La integración con Google no está configurada en el servidor.',
      });
  }

  // ── Cifrado de tokens ────────────────────────────────────────────────────────
  private enc(s: string): string {
    return encryptBlob(this.key()!, Buffer.from(s, 'utf8')).toString('base64');
  }
  private dec(b64: string): string {
    return decryptBlob(this.key()!, Buffer.from(b64, 'base64')).toString('utf8');
  }

  // ── State firmado (CSRF + porta el usuario hasta el callback) ─────────────────
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
      redirect_uri: this.redirectUri()!,
      response_type: 'code',
      scope: SCOPES.join(' '),
      access_type: 'offline',
      prompt: 'consent',
      include_granted_scopes: 'true',
      state: this.signState(user),
    });
    return { url: `${AUTH_URL}?${params.toString()}` };
  }

  /** Intercambia el code por tokens y guarda la conexión (rol system: el redirect no trae sesión). */
  async handleCallback(code: string, state: string): Promise<{ webRedirect: string }> {
    const appUrl = this.config.get<string>('APP_PUBLIC_URL') ?? 'https://lawzora.com';
    const st = this.verifyState(state);
    if (!st) return { webRedirect: `${appUrl}/es/settings?google=error` };
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.clientId()!,
        client_secret: this.clientSecret()!,
        redirect_uri: this.redirectUri()!,
        grant_type: 'authorization_code',
      }),
    });
    if (!res.ok) return { webRedirect: `${appUrl}/es/settings?google=error` };
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
    return { webRedirect: `${appUrl}/es/settings?google=connected` };
  }

  private emailFromIdToken(idToken?: string): string | null {
    if (!idToken) return null;
    try {
      const part = idToken.split('.')[1]!;
      const o = JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
      return typeof o.email === 'string' ? o.email : null;
    } catch {
      return null;
    }
  }

  async status(user: RequestUser) {
    const conn = this.isConfigured()
      ? await this.prisma.oAuthConnection.findUnique({
          where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
          select: { externalEmail: true, scopes: true, createdAt: true },
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

  /** Devuelve un access token válido (refresca si expiró). */
  private async accessTokenFor(userId: string): Promise<string> {
    const conn = await this.prisma.oAuthConnection.findUnique({
      where: { userId_provider: { userId, provider: PROVIDER } },
    });
    if (!conn) throw new BadRequestException({ messageKey: 'integrations.notConnected' });
    const fresh = !conn.expiresAt || conn.expiresAt.getTime() > Date.now() + 60_000;
    if (fresh) return this.dec(conn.accessToken);
    if (!conn.refreshToken) return this.dec(conn.accessToken);
    const res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: this.clientId()!,
        client_secret: this.clientSecret()!,
        refresh_token: this.dec(conn.refreshToken),
        grant_type: 'refresh_token',
      }),
    });
    if (!res.ok) return this.dec(conn.accessToken);
    const tok = (await res.json()) as { access_token: string; expires_in?: number };
    await this.prisma.oAuthConnection.update({
      where: { id: conn.id },
      data: {
        accessToken: this.enc(tok.access_token),
        expiresAt: tok.expires_in ? new Date(Date.now() + tok.expires_in * 1000) : null,
      },
    });
    return tok.access_token;
  }

  // ── Calendar push (Lawzora → Google) ─────────────────────────────────────────
  /** Empuja los plazos/tareas con vencimiento del despacho como eventos en el Google del usuario. */
  async syncCalendar(user: RequestUser): Promise<{ pushed: number; errors: number }> {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const tasks = await this.prisma.task.findMany({
      where: { tenantId: user.tenantId, status: { in: OPEN }, dueDate: { not: null } },
      include: { matter: { select: { reference: true, client: { select: { name: true } } } } },
    });
    let pushed = 0;
    let errors = 0;
    for (const t of tasks) {
      if (!t.dueDate) continue;
      const date = t.dueDate.toISOString().slice(0, 10);
      const end = new Date(t.dueDate.getTime() + 86_400_000).toISOString().slice(0, 10);
      const eventId = createHash('sha1').update(t.id).digest('hex'); // id determinista (hex = válido)
      const body = JSON.stringify({
        id: eventId,
        summary: (t.isProcedural ? '⚖ ' : '') + (t.deadlineType || t.title),
        description: [t.matter?.reference, t.matter?.client?.name].filter(Boolean).join(' · '),
        start: { date },
        end: { date: end },
      });
      const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
      // insert con id fijo; si ya existe (409) → update (PUT). Idempotente.
      let r = await fetch(CAL_BASE, { method: 'POST', headers, body });
      if (r.status === 409)
        r = await fetch(`${CAL_BASE}/${eventId}`, { method: 'PUT', headers, body });
      if (r.ok) pushed += 1;
      else errors += 1;
    }
    return { pushed, errors };
  }

  // ── Gmail (correspondencia del expediente) ───────────────────────────────────
  private header(msg: any, name: string): string {
    const h = (msg?.payload?.headers ?? []).find(
      (x: any) => x.name?.toLowerCase() === name.toLowerCase(),
    );
    return h?.value ?? '';
  }

  /** Bandeja reciente (metadatos) para elegir qué correo adjuntar a un expediente. */
  async listRecentEmails(user: RequestUser) {
    this.assertConfigured();
    const token = await this.accessTokenFor(user.userId);
    const headers = { Authorization: `Bearer ${token}` };
    const list = await fetch(`${GMAIL_BASE}/messages?maxResults=15&q=in:anywhere`, { headers });
    if (!list.ok) return [];
    const ids = ((await list.json()) as { messages?: { id: string }[] }).messages ?? [];
    const out = [];
    for (const { id } of ids) {
      const r = await fetch(
        `${GMAIL_BASE}/messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        { headers },
      );
      if (!r.ok) continue;
      const m: any = await r.json();
      out.push({
        gmailId: id,
        from: this.header(m, 'From'),
        to: this.header(m, 'To'),
        subject: this.header(m, 'Subject'),
        snippet: (m.snippet as string) ?? '',
        date: this.header(m, 'Date'),
      });
    }
    return out;
  }

  private async assertMatter(user: RequestUser, matterId: string) {
    const m = await this.prisma.matter.findFirst({
      where: { id: matterId, tenantId: user.tenantId },
      select: { id: true },
    });
    if (!m) throw new BadRequestException({ messageKey: 'matters.notFound' });
  }

  /** Adjunta un correo de la bandeja al expediente (idempotente por gmailId+expediente). */
  async attachEmail(user: RequestUser, matterId: string, gmailId: string) {
    this.assertConfigured();
    await this.assertMatter(user, matterId);
    const existing = await this.prisma.matterEmail.findFirst({
      where: { tenantId: user.tenantId, matterId, gmailId },
      select: { id: true },
    });
    if (existing) return { id: existing.id, duplicate: true };
    const token = await this.accessTokenFor(user.userId);
    const r = await fetch(
      `${GMAIL_BASE}/messages/${gmailId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!r.ok) throw new BadRequestException({ messageKey: 'integrations.gmailFetchFailed' });
    const m: any = await r.json();
    const dateHdr = this.header(m, 'Date');
    const sentAt = dateHdr ? new Date(dateHdr) : new Date();
    const created = await this.prisma.matterEmail.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        userId: user.userId,
        direction: 'IN',
        gmailId,
        fromAddr: this.header(m, 'From') || '—',
        toAddr: this.header(m, 'To') || '—',
        subject: this.header(m, 'Subject') || null,
        snippet: (m.snippet as string) ?? null,
        sentAt: isNaN(sentAt.getTime()) ? new Date() : sentAt,
      },
      select: { id: true },
    });
    return { id: created.id, duplicate: false };
  }

  /** Envía un correo desde el Gmail del usuario y lo registra en el expediente (OUT). */
  async sendEmail(user: RequestUser, matterId: string, to: string, subject: string, body: string) {
    this.assertConfigured();
    await this.assertMatter(user, matterId);
    const token = await this.accessTokenFor(user.userId);
    const conn = await this.prisma.oAuthConnection.findUnique({
      where: { userId_provider: { userId: user.userId, provider: PROVIDER } },
      select: { externalEmail: true },
    });
    const from = conn?.externalEmail ?? user.email;
    const encSubject = `=?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
    const mime = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${encSubject}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: 8bit',
      '',
      body,
    ].join('\r\n');
    const raw = Buffer.from(mime, 'utf8').toString('base64url');
    const r = await fetch(`${GMAIL_BASE}/messages/send`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ raw }),
    });
    if (!r.ok) throw new BadRequestException({ messageKey: 'integrations.gmailSendFailed' });
    const sent = (await r.json()) as { id?: string };
    const created = await this.prisma.matterEmail.create({
      data: {
        tenantId: user.tenantId,
        matterId,
        userId: user.userId,
        direction: 'OUT',
        gmailId: sent.id ?? null,
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

  /** Correspondencia registrada de un expediente (ambas direcciones), más reciente primero. */
  async listMatterEmails(user: RequestUser, matterId: string) {
    await this.assertMatter(user, matterId);
    return this.prisma.matterEmail.findMany({
      where: { tenantId: user.tenantId, matterId },
      orderBy: { sentAt: 'desc' },
      select: {
        id: true,
        direction: true,
        fromAddr: true,
        toAddr: true,
        subject: true,
        snippet: true,
        sentAt: true,
      },
    });
  }
}
