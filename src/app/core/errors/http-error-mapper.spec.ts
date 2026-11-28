import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { AppError } from './app-error';
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from './error-catalog';
import { toAppError } from './http-error-mapper';

function httpError(status: number, body: unknown, headers?: Record<string, string>): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, headers: new HttpHeaders(headers) });
}

describe('toAppError', () => {
  it('INVALID_GRANULARITY y GRANULARITY_TOO_FINE (422) salen en español del catálogo, sin el texto ni el número del servidor', () => {
    const invalid = toAppError(httpError(422, { error: { code: 'INVALID_GRANULARITY', message: 'La granularidad debe ser day, week, month' } }));
    const fine = toAppError(httpError(422, { error: { code: 'GRANULARITY_TOO_FINE', message: 'El periodo tiene 700 días: la serie diaria admite hasta 400.' } }));

    expect([invalid.kind, invalid.code]).toEqual(['validation', 'INVALID_GRANULARITY']);
    expect(invalid.message).toBe('Esa granularidad no es válida: elige diaria, semanal, mensual, trimestral, semestral o anual.');
    expect([fine.kind, fine.code]).toEqual(['validation', 'GRANULARITY_TOO_FINE']);
    expect(fine.message).toBe('El periodo es demasiado largo para ver la serie diaria. Elige granularidad semanal o mensual, o un periodo más corto.');
    expect(fine.message).not.toMatch(/\d{3}/);
  });

  it('INVALID_PERIOD (422) sale en español del catálogo, sin el texto del servidor', () => {
    const period = toAppError(httpError(422, { error: { code: 'INVALID_PERIOD', message: 'from must be between 2000-01-01 and 2100-12-31' } }));

    expect([period.kind, period.code]).toEqual(['validation', 'INVALID_PERIOD']);
    expect(period.message).toBe('El periodo no es válido: indica la fecha inicial y la final, y que la inicial no sea posterior.');
  });

  it('traduce un código conocido con el mensaje del catálogo, no con el del servidor', () => {
    const error = toAppError(
      httpError(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Mensaje interno del servidor', request_id: 'req-1' } }),
    );

    expect(error.kind).toBe('unauthenticated');
    expect(error.code).toBe('INVALID_CREDENTIALS');
    expect(error.message).toBe('El correo o la contraseña no son correctos.');
    expect(error.message).not.toContain('interno');
    expect(error.requestId).toBe('req-1');
  });

  it('un código desconocido usa un mensaje genérico por estado y conserva el request_id', () => {
    const error = toAppError(httpError(500, { error: { code: 'ALGO_NUEVO', message: 'Traceback: db password', request_id: 'abc123' } }));

    expect(error.kind).toBe('server');
    expect(error.code).toBe('ALGO_NUEVO');
    expect(error.message).not.toContain('Traceback');
    expect(error.requestId).toBe('abc123');
  });

  it('sin cuerpo reconocible usa el mensaje genérico', () => {
    const error = toAppError(httpError(418, '<html>teapot</html>'));
    expect(error.message).toBe(GENERIC_ERROR_MESSAGE);
    expect(error.requestId).toBeNull();
  });

  it('estado 0 es un error de red', () => {
    const error = toAppError(httpError(0, null));
    expect(error.kind).toBe('network');
    expect(error.message).toBe(NETWORK_ERROR_MESSAGE);
  });

  it('expone los campos inválidos de un 422 sin los textos del servidor', () => {
    const error = toAppError(
      httpError(422, { error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 'body.email', message: 'value is not a valid email', type: 'value_error' }] } }),
    );

    expect(error.kind).toBe('validation');
    expect(error.details).toEqual([{ field: 'body.email', type: 'value_error' }]);
  });

  it('conserva solo el identificador de lo que ya existe (p. ej. el vínculo duplicado), nunca otros textos del servidor', () => {
    const error = toAppError(
      httpError(409, { error: { code: 'LINK_INVERSE_PENDING', message: 'x', details: [{ field: 'link_id', message: 'abc-123' }, { field: 'body.note', message: 'texto del servidor' }] } }),
    );

    expect(error.details).toEqual([
      { field: 'link_id', type: null, message: 'abc-123' },
      { field: 'body.note', type: null },
    ]);
  });

  it('interpreta Retry-After en un 429', () => {
    const error = toAppError(httpError(429, { error: { code: 'LOGIN_RATE_LIMITED' } }, { 'Retry-After': '30' }));
    expect(error.kind).toBe('rate-limited');
    expect(error.retryAfterSeconds).toBe(30);
  });

  it('no vuelve a envolver un AppError', () => {
    const original = new AppError('server', 'X', 500, 'x');
    expect(toAppError(original)).toBe(original);
    expect(original).toBeInstanceOf(AppError);
  });

  it('un valor desconocido produce un error genérico', () => {
    expect(toAppError('boom').kind).toBe('unknown');
  });

  it('traduce los códigos de las cargas y del almacenamiento', () => {
    expect(toAppError(httpError(409, { error: { code: 'IMPORT_NOT_REVIEWED' } })).message).toContain('revisión de esta carga aún no termina');
    expect(toAppError(httpError(413, { error: { code: 'STORAGE_QUOTA_EXCEEDED' } })).message).toContain('espacio de almacenamiento');
    expect(toAppError(httpError(422, { error: { code: 'SELECTION_TOO_LARGE' } })).message).toContain('demasiados vehículos');
    expect(toAppError(httpError(503, { error: { code: 'STORAGE_UNAVAILABLE' } })).message).toContain('almacenamiento de archivos no está disponible');
  });

  it('traduce en español corto todos los códigos de completar viajes', () => {
    const codes = [
      'TRIP_VERSION_CONFLICT', 'TRIP_ALREADY_CALCULATED', 'TRIP_NOT_EDITABLE', 'TRIP_HAS_CONFIRMED_MATCH', 'TRIP_NOT_COMPLETABLE', 'FIELD_NOT_EDITABLE', 'INVALID_FIELD_VALUE',
      'COMPLETION_TOO_LARGE', 'COMPLETION_TOKEN_INVALID', 'COMPLETION_TOKEN_EXPIRED', 'COMPLETION_PREVIEW_STALE', 'IMPORT_HAS_CORRECTIONS', 'COMPANY_BUSY',
    ];

    for (const code of codes) {
      const message = toAppError(httpError(409, { error: { code, message: 'texto del servidor' } })).message;

      expect(message).withContext(code).not.toBe(GENERIC_ERROR_MESSAGE);
      expect(message).withContext(code).not.toContain('servidor');
      expect(message.length).withContext(code).toBeLessThan(140);
    }

    expect(toAppError(httpError(422, { error: { code: 'COMPLETION_TOO_LARGE' } })).message).toContain('5.000');
  });

  it('en INVALID_FIELD_VALUE y FIELD_NOT_EDITABLE conserva el mensaje de la regla por campo; en otros códigos sigue sin propagar texto del servidor', () => {
    const details = [{ field: 'efficiency.value', message: 'Debe ser mayor que 0 y no superar 100', type: 'number' }];

    expect(toAppError(httpError(422, { error: { code: 'INVALID_FIELD_VALUE', details } })).details).toEqual([{ field: 'efficiency.value', type: 'number', message: 'Debe ser mayor que 0 y no superar 100' }]);
    expect(toAppError(httpError(422, { error: { code: 'FIELD_NOT_EDITABLE', details } })).details[0].message).toContain('Debe ser');
    expect(toAppError(httpError(422, { error: { code: 'OTRO', details } })).details).toEqual([{ field: 'efficiency.value', type: 'number' }]);
  });

  it('en TRIP_VERSION_CONFLICT conserva `data` (el estado vigente) y la versión; en otros errores `data` es null', () => {
    const conflict = toAppError(httpError(409, { error: { code: 'TRIP_VERSION_CONFLICT', details: [{ field: 'version', message: '3', type: 'current_version' }] }, data: { version: 3 } }));

    expect(conflict.data).toEqual({ version: 3 });
    expect(conflict.details[0].message).toBe('3');
    expect(toAppError(httpError(409, { error: { code: 'TRIP_NOT_EDITABLE' }, data: { x: 1 } })).data).toBeNull();
  });
});
