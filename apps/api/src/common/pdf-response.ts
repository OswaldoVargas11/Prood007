import { StreamableFile } from '@nestjs/common';

/** Envuelve un Buffer de PDF en un StreamableFile con cabeceras de descarga (`application/pdf`). */
export function pdfStream(buffer: Buffer, filename: string): StreamableFile {
  return new StreamableFile(buffer, {
    type: 'application/pdf',
    disposition: `attachment; filename="${filename}"`,
  });
}
