import { HttpClient, HttpErrorResponse, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, catchError, from, map, switchMap, throwError } from 'rxjs';
import { APP_CONFIG } from '../../core/config/app-config';
import {
  ApiResponseDto,
  PaginatedResponseDto,
} from '../../core/http/api-envelope';

export type QueryParams = Readonly<Record<string, string | number | boolean | undefined | null>>;

/**
 * Único lugar que conoce la URL del backend y el sobre `{data, meta}`.
 * Solo lo usan los repositorios HTTP; los componentes nunca lo inyectan.
 */
@Injectable({ providedIn: 'root' })
export class ApiClient {
  private readonly http = inject(HttpClient);
  private readonly config = inject(APP_CONFIG);

  get<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http
      .get<ApiResponseDto<T>>(this.url(path), { params: this.toParams(params) })
      .pipe(map((response) => response.data));
  }

  /** El cuerpo completo (`data` y `meta`) para contratos con un `meta` propio, como la auditoría por cursor. */
  getBody<T>(path: string, params?: QueryParams): Observable<T> {
    return this.http.get<T>(this.url(path), { params: this.toParams(params) });
  }

  getPage<T>(path: string, params?: QueryParams): Observable<PaginatedResponseDto<T>> {
    return this.http.get<PaginatedResponseDto<T>>(this.url(path), {
      params: this.toParams(params),
    });
  }

  /** `body` puede ser `FormData` (multipart): `HttpClient` fija entonces el `Content-Type` con su separador. `headers` son cabeceras propias de la solicitud. */
  post<T>(path: string, body: unknown, headers?: Readonly<Record<string, string>>): Observable<T> {
    return this.http
      .post<ApiResponseDto<T>>(this.url(path), body, headers ? { headers } : undefined)
      .pipe(map((response) => response.data));
  }

  /** POST sin cuerpo cuya respuesta es 204 (sin sobre `{data, meta}`), p. ej. cerrar la sesión. */
  postEmpty(path: string): Observable<void> {
    return this.http.post<void>(this.url(path), null);
  }

  put<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .put<ApiResponseDto<T>>(this.url(path), body)
      .pipe(map((response) => response.data));
  }

  patch<T>(path: string, body: unknown): Observable<T> {
    return this.http
      .patch<ApiResponseDto<T>>(this.url(path), body)
      .pipe(map((response) => response.data));
  }

  /** GET de un archivo (imagen): el `<img>` no puede enviar el token, así que se pide como Blob con la sesión. */
  getBlob(path: string): Observable<Blob> {
    return this.http.get(this.url(path), { responseType: 'blob' });
  }

  /**
   * GET de un archivo con su nombre (`Content-Disposition`, si el servidor lo expone; si no, `null`). Si el servidor responde con un error,
   * su cuerpo llega como `Blob`: se lee como JSON para que el código de error estable llegue al catálogo de mensajes.
   */
  getFile(path: string, params?: QueryParams): Observable<{ readonly blob: Blob; readonly fileName: string | null }> {
    return this.http.get(this.url(path), { params: this.toParams(params), responseType: 'blob', observe: 'response' }).pipe(
      map((response) => ({ blob: response.body as Blob, fileName: fileNameOf(response.headers.get('Content-Disposition')) })),
      catchError((error: unknown) => (error instanceof HttpErrorResponse && error.error instanceof Blob ? readErrorBody(error) : throwError(() => error))),
    );
  }

  /** PUT con cuerpo binario (sin `multipart`). */
  putBinary<T>(path: string, body: Blob, contentType: string): Observable<T> {
    return this.http
      .put<ApiResponseDto<T>>(this.url(path), body, { headers: { 'Content-Type': contentType } })
      .pipe(map((response) => response.data));
  }

  delete(path: string): Observable<void> {
    return this.http.delete<void>(this.url(path));
  }

  /** DELETE cuya respuesta trae un resultado en `data` (p. ej. cuántos viajes volvieron atrás al deshacer una decisión). */
  deleteData<T>(path: string): Observable<T> {
    return this.http.delete<ApiResponseDto<T>>(this.url(path)).pipe(map((response) => response.data));
  }

  /** GET fuera del prefijo de versión y sin sobre `{data, meta}` (p. ej. `/health`). */
  getRoot<T>(path: string): Observable<T> {
    return this.http.get<T>(`${this.config.apiBaseUrl}${path}`);
  }

  private url(path: string): string {
    return `${this.config.apiBaseUrl}${this.config.apiPrefix}${path}`;
  }

  private toParams(params?: QueryParams): HttpParams {
    let result = new HttpParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      if (value !== undefined && value !== null && value !== '') {
        result = result.set(key, String(value));
      }
    }
    return result;
  }
}

/** Nombre del archivo en `Content-Disposition` (`filename*=UTF-8''…` o `filename="…"`); sin cabecera o sin nombre, `null`. */
export function fileNameOf(header: string | null): string | null {
  if (!header) return null;

  const encoded = /filename\*\s*=\s*UTF-8''([^;]+)/i.exec(header)?.[1];

  if (encoded) {
    try {
      return decodeURIComponent(encoded.trim());
    } catch {
      return null;
    }
  }

  return /filename\s*=\s*"?([^";]+)"?/i.exec(header)?.[1]?.trim() || null;
}

/** Reemplaza el cuerpo `Blob` de un error por su JSON (o `null` si no lo es) y lo vuelve a lanzar con el mismo estado y cabeceras. */
function readErrorBody(error: HttpErrorResponse): Observable<never> {
  return from(error.error.text() as Promise<string>).pipe(
    map((text): unknown => {
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    }),
    switchMap((body) => throwError(() => new HttpErrorResponse({ error: body, headers: error.headers, status: error.status, statusText: error.statusText, url: error.url ?? undefined }))),
  );
}
