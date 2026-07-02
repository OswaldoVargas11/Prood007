import { timingSafeEqual } from 'node:crypto';
import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  RawBodyRequest,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { SignaturesService } from './signatures.service';
import { Public } from '../auth/decorators/public.decorator';
import { apiError } from '../common/api-messages';

/**
 * Webhook de Signaturit. Ruta PÚBLICA (la llama el proveedor, no un usuario): el tenant NO sale de un
 * usuario autenticado sino de la fila local que casa con el evento. Requiere el cuerpo CRUDO
 * (rawBody en `main.ts`). Controller separado para no heredar el `@Roles` del módulo. Ver webhook de
 * cobros (mismo patrón, D-024).
 *
 * DOS mecanismos de autenticación:
 *  - HMAC propio (`x-signaturit-signature`): herramientas internas y tests (Signaturit NO firma así).
 *  - Basic auth embebido en la `events_url` (mecanismo documentado por Signaturit, que no firma sus
 *    webhooks): la contraseña se compara en tiempo constante contra SIGNATURE_WEBHOOK_SECRET.
 *    La ruta con sufijo `.json` existe porque así pide Signaturit el payload en JSON.
 */
@Controller('signatures/webhook')
export class SignaturesWebhookController {
  constructor(private readonly signatures: SignaturesService) {}

  @Public()
  @HttpCode(200)
  @Post(['signaturit', 'signaturit.json'])
  signaturit(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-signaturit-signature') signature?: string,
    @Headers('authorization') authorization?: string,
  ) {
    if (!req.rawBody) {
      throw new BadRequestException(apiError('signatures.webhookInvalid'));
    }
    if (signature) {
      return this.signatures.handleWebhook(req.rawBody, signature);
    }
    if (this.basicAuthValid(authorization)) {
      return this.signatures.handleVerifiedWebhook(req.rawBody);
    }
    throw new BadRequestException(apiError('signatures.webhookInvalid'));
  }

  /**
   * Valida `Authorization: Basic base64(usuario:token)` contra SIGNATURE_WEBHOOK_SECRET. El
   * credencial NO es una contraseña de usuario sino un token compartido GENERADO (alta entropía)
   * embebido en la events_url; el usuario se ignora. Comparación en tiempo constante
   * (`timingSafeEqual`); la comprobación previa de longitud solo revela la longitud del token, que
   * con un secreto aleatorio largo no aporta nada al atacante. Fail-closed sin secreto configurado.
   */
  private basicAuthValid(authorization?: string): boolean {
    const secret = process.env.SIGNATURE_WEBHOOK_SECRET;
    if (!secret || !authorization?.startsWith('Basic ')) return false;
    let decoded: string;
    try {
      decoded = Buffer.from(authorization.slice(6), 'base64').toString('utf8');
    } catch {
      return false;
    }
    const providedToken = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : '';
    const a = Buffer.from(providedToken, 'utf8');
    const b = Buffer.from(secret, 'utf8');
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
