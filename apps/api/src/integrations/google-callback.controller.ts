import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { GoogleService } from './google.service';
import { firstQueryString } from './oauth-query.util';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Callback OAuth de Google (público: el redirect del navegador desde Google no trae nuestra sesión).
 * Intercambia el `code` y redirige de vuelta a Ajustes del web. La URL exacta debe estar registrada
 * como "Authorized redirect URI" en la consola de Google.
 */
@Public()
@Controller('integrations/google')
export class GoogleCallbackController {
  constructor(private readonly google: GoogleService) {}

  @Get('callback')
  async callback(
    @Query('code') rawCode: unknown,
    @Query('state') rawState: unknown,
    @Res() res: Response,
  ) {
    // Normaliza a string en el BORDE: `qs` puede parsear `?code=a&code=b` como array (LAW-72,
    // type-confusion). Un array/objeto se descarta → OAuth error, nunca llega a verifyState.
    const code = firstQueryString(rawCode);
    const state = firstQueryString(rawState);
    const appUrl = process.env.APP_PUBLIC_URL ?? 'https://lawzora.com';
    if (!code || !state) return res.redirect(`${appUrl}/es/settings?google=error`);
    const { webRedirect } = await this.google.handleCallback(code, state);
    return res.redirect(webRedirect);
  }
}
