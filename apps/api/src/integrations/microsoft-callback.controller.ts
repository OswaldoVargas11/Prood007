import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { MicrosoftService } from './microsoft.service';
import { firstQueryString } from './oauth-query.util';
import { Public } from '../auth/decorators/public.decorator';

/**
 * Callback OAuth de Microsoft (público: el redirect del navegador no trae nuestra sesión). La URL debe
 * estar registrada como "Redirect URI" en la app de Azure (Microsoft Entra ID).
 */
@Public()
@Controller('integrations/microsoft')
export class MicrosoftCallbackController {
  constructor(private readonly microsoft: MicrosoftService) {}

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
    if (!code || !state) return res.redirect(`${appUrl}/es/settings?microsoft=error`);
    const { webRedirect } = await this.microsoft.handleCallback(code, state);
    return res.redirect(webRedirect);
  }
}
