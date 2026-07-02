import { createHash, timingSafeEqual } from 'node:crypto';
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
   * Valida `Authorization: Basic base64(usuario:contraseña)` contra SIGNATURE_WEBHOOK_SECRET
   * (contraseña; el usuario se ignora), en tiempo constante vía hash. Fail-closed sin secreto.
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
    const password = decoded.includes(':') ? decoded.slice(decoded.indexOf(':') + 1) : '';
    // Hash previo: iguala longitudes para poder comparar en tiempo constante sin filtrar la longitud.
    const a = createHash('sha256').update(password, 'utf8').digest();
    const b = createHash('sha256').update(secret, 'utf8').digest();
    return timingSafeEqual(a, b);
  }
}
