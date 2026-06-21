/**
 * Carga y abre el Google Picker para elegir un fichero de Drive.
 *
 * Seguridad: el navegador obtiene su PROPIO access token (scope `drive.file`) con Google Identity
 * Services solo para pintar el selector; el token del servidor nunca viaja al cliente. Al elegir, solo
 * mandamos el `fileId` a la API y el servidor descarga los bytes con su token (mismo client_id → el
 * fichero seleccionado queda accesible a la app). `drive.file` no da acceso a todo el Drive, solo a lo
 * que el usuario elige aquí.
 */

export interface GooglePickerConfig {
  clientId: string;
  apiKey: string;
  appId: string;
  scope: string;
}

export interface PickedFile {
  id: string;
  name: string;
}

const scriptCache = new Map<string, Promise<void>>();

function loadScript(src: string): Promise<void> {
  const cached = scriptCache.get(src);
  if (cached) return cached;
  const p = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => reject(new Error(`No se pudo cargar ${src}`));
    document.head.appendChild(el);
  });
  scriptCache.set(src, p);
  return p;
}

async function ensurePicker(): Promise<void> {
  await loadScript('https://apis.google.com/js/api.js');
  await new Promise<void>((resolve) => {
    (window as any).gapi.load('picker', { callback: () => resolve() });
  });
}

async function requestAccessToken(clientId: string, scope: string): Promise<string> {
  await loadScript('https://accounts.google.com/gsi/client');
  return new Promise<string>((resolve, reject) => {
    const client = (window as any).google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope,
      callback: (resp: any) => {
        if (resp?.error) reject(new Error(resp.error));
        else resolve(resp.access_token as string);
      },
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Abre el Picker y resuelve con el fichero elegido, o `null` si el usuario cancela. */
export async function openGooglePicker(cfg: GooglePickerConfig): Promise<PickedFile | null> {
  const [token] = await Promise.all([requestAccessToken(cfg.clientId, cfg.scope), ensurePicker()]);
  const google = (window as any).google;
  return new Promise<PickedFile | null>((resolve) => {
    const view = new google.picker.DocsView(google.picker.ViewId.DOCS)
      .setIncludeFolders(true)
      .setSelectFolderEnabled(false);
    const picker = new google.picker.PickerBuilder()
      .enableFeature(google.picker.Feature.SUPPORT_DRIVES)
      .setDeveloperKey(cfg.apiKey)
      .setAppId(cfg.appId)
      .setOAuthToken(token)
      .addView(view)
      .setCallback((data: any) => {
        const action = data[google.picker.Response.ACTION];
        if (action === google.picker.Action.PICKED) {
          const doc = data[google.picker.Response.DOCUMENTS]?.[0];
          resolve(
            doc
              ? { id: doc[google.picker.Document.ID], name: doc[google.picker.Document.NAME] }
              : null,
          );
        } else if (action === google.picker.Action.CANCEL) {
          resolve(null);
        }
      })
      .build();
    picker.setVisible(true);
  });
}
