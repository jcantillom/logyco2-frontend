import { HttpErrorResponse } from '@angular/common/http';
import { ErrorResponseDto } from '../http/api-envelope';
import { AppError, FieldIssue } from './app-error';
import { kindForStatus, messageFor } from './error-catalog';

function isErrorBody(body: unknown): body is ErrorResponseDto {
  return (
    typeof body === 'object' &&
    body !== null &&
    'error' in body &&
    typeof (body as ErrorResponseDto).error === 'object' &&
    (body as ErrorResponseDto).error !== null &&
    typeof (body as ErrorResponseDto).error.code === 'string'
  );
}

function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  return Number.isFinite(seconds) && seconds > 0 ? Math.ceil(seconds) : null;
}

/** Campos de `details` que llevan un identificador (UUID) y no un texto: los únicos cuyo valor se conserva. */
const REFERENCE_FIELDS: ReadonlySet<string> = new Set(['link_id', 'organization_id']);

/**
 * Traduce cualquier error de transporte al `AppError` de la aplicación.
 * Nunca propaga el texto crudo del servidor ni detalles internos.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) return error;

  if (error instanceof HttpErrorResponse) {
    const body: unknown = error.error;
    const known = isErrorBody(body) ? body.error : null;
    const code = known?.code ?? null;
    const details: FieldIssue[] = (known?.details ?? [])
      .filter((detail) => !!detail.field)
      .map((detail) => {
        const issue: FieldIssue = { field: detail.field as string, type: detail.type ?? null };

        // Nunca se propaga el texto del servidor: solo el identificador que permite navegar a algo que ya existe (p. ej. el vínculo duplicado).
        return REFERENCE_FIELDS.has(issue.field) && detail.message ? { ...issue, message: detail.message } : issue;
      });

    return new AppError(
      kindForStatus(error.status),
      code ?? `HTTP_${error.status}`,
      error.status,
      messageFor(code, error.status),
      known?.request_id ?? null,
      details,
      parseRetryAfter(error.headers?.get('Retry-After') ?? null),
    );
  }

  return new AppError('unknown', 'UNKNOWN', 0, messageFor(null, -1));
}
