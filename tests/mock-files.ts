import { vi } from 'vitest';

/**
 * Antwort für eine URL: beliebiger Inhalt (als JSON), Rohtext, ein HTTP-Status,
 * ein Netzwerkfehler oder eine Anfrage, die nie antwortet.
 */
export type FileResponse =
  | { raw: string }
  | { status: number }
  | { hang: true }
  | Error
  | Record<string, unknown>;

export interface MockFiles {
  /** Dateien auf dem „Server“; Tests können sie nachträglich ändern. Fehlt eine URL: 404. */
  files: Record<string, FileResponse>;
  /** Angefragte URLs in Reihenfolge. */
  requests: string[];
  /** Optionen der Anfragen in Reihenfolge. */
  inits: (RequestInit | undefined)[];
}

/** Ersetzt fetch durch einen Server mit festen Dateien. */
export function mockFiles(files: Record<string, FileResponse> = {}): MockFiles {
  const mock: MockFiles = { files, requests: [], inits: [] };
  vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    mock.requests.push(url);
    mock.inits.push(init);
    const file = mock.files[url];
    if (file === undefined) {
      return new Response('Not Found', { status: 404 });
    }
    if (file instanceof Error) {
      throw file;
    }
    if ('hang' in file) {
      return new Promise<Response>(() => {});
    }
    if ('status' in file && typeof file.status === 'number') {
      return new Response('Fehler', { status: file.status });
    }
    const body = 'raw' in file && typeof file.raw === 'string' ? file.raw : JSON.stringify(file);
    return new Response(body, { status: 200 });
  });
  return mock;
}
