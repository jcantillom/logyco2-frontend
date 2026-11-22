import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
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

  /** PUT con cuerpo binario (sin `multipart`). */
  putBinary<T>(path: string, body: Blob, contentType: string): Observable<T> {
    return this.http
      .put<ApiResponseDto<T>>(this.url(path), body, { headers: { 'Content-Type': contentType } })
      .pipe(map((response) => response.data));
  }

  delete(path: string): Observable<void> {
    return this.http.delete<void>(this.url(path));
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
