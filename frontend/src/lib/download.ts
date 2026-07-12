import { api } from './api';

/**
 * Download a file from an authenticated API endpoint.
 *
 * The report export endpoint requires the Basic auth header, so a plain
 * `<a href>` / `window.open` would 401. Instead we fetch the file as a Blob
 * through the axios instance (which attaches the auth header), then synthesize
 * an object URL and click a temporary anchor to trigger the browser download,
 * honouring the server's Content-Disposition filename.
 */
export async function downloadFile(
  url: string,
  params?: Record<string, string | number>,
): Promise<void> {
  const response = await api.get(url, { params, responseType: 'blob' });

  const disposition = String(response.headers['content-disposition'] ?? '');
  const filename = parseFilename(disposition) ?? fallbackName(url);

  const blob = response.data as Blob;
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoke on the next tick so the download has a chance to start.
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}

function parseFilename(disposition: string): string | null {
  // filename*=UTF-8''name.xlsx  (preferred, RFC 5987)
  const star = /filename\*=(?:UTF-8'')?"?([^";]+)"?/i.exec(disposition);
  if (star?.[1]) return decodeURIComponent(star[1].trim());
  const plain = /filename="?([^";]+)"?/i.exec(disposition);
  if (plain?.[1]) return plain[1].trim();
  return null;
}

function fallbackName(url: string): string {
  return url.includes('report') ? 'recruitment_report' : 'download';
}
