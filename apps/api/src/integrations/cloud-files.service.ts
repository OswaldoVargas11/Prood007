import { BadRequestException, Injectable } from '@nestjs/common';
import { GoogleService } from './google.service';
import { MicrosoftService } from './microsoft.service';
import type { RequestUser } from '../auth/auth.types';

/** Referencia opaca al fichero elegido en la nube; las claves útiles dependen del proveedor. */
export interface CloudFileRef {
  fileId?: string; // Google Drive
  driveId?: string; // OneDrive / SharePoint
  itemId?: string; // OneDrive / SharePoint
}

export interface FetchedCloudFile {
  buffer: Buffer;
  mimeType: string;
  filename: string;
  sizeBytes: number;
}

/**
 * Capa fina que, dado un proveedor + referencia de fichero, descarga sus bytes reutilizando la conexión
 * OAuth ya existente (tokens cifrados). El servidor SIEMPRE descarga el contenido (cadena de custodia):
 * aunque el usuario elija el fichero en el selector del proveedor, los bytes acaban en nuestro
 * almacenamiento cifrado pasando por el mismo pipeline que una subida normal.
 */
@Injectable()
export class CloudFilesService {
  constructor(
    private readonly google: GoogleService,
    private readonly microsoft: MicrosoftService,
  ) {}

  async fetch(user: RequestUser, provider: string, ref: CloudFileRef): Promise<FetchedCloudFile> {
    if (provider === 'google') {
      if (!ref.fileId)
        throw new BadRequestException({ messageKey: 'integrations.cloudRefMissing' });
      return this.google.fetchDriveFile(user, ref.fileId);
    }
    if (provider === 'microsoft') {
      if (!ref.driveId || !ref.itemId)
        throw new BadRequestException({ messageKey: 'integrations.cloudRefMissing' });
      return this.microsoft.fetchDriveItem(user, ref.driveId, ref.itemId);
    }
    throw new BadRequestException({ messageKey: 'integrations.cloudProviderUnknown' });
  }
}
