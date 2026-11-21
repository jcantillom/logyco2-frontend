import { HttpErrorResponse, HttpHeaders } from '@angular/common/http';
import { AppError } from './app-error';
import { GENERIC_ERROR_MESSAGE, NETWORK_ERROR_MESSAGE } from './error-catalog';
import { toAppError } from './http-error-mapper';

function httpError(status: number, body: unknown, headers?: Record<string, string>): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, headers: new HttpHeaders(headers) });
}

describe('toAppError', () => {
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
});
