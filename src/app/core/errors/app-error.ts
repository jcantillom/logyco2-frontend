export type AppErrorKind =
  | 'network'
  | 'unauthenticated'
  | 'forbidden'
  | 'not-found'
  | 'conflict'
  | 'validation'
  | 'rate-limited'
  | 'server'
  | 'unknown';

export interface FieldIssue {
  /** Ruta del campo tal como la informa el backend (p. ej. `body.email`). */
  readonly field: string;
  readonly type: string | null;
  /** Dato asociado que informa el servidor (p. ej. el id del vínculo que ya existe). */
  readonly message?: string | null;
}

/**
 * Error de aplicación ya interpretado. `message` es siempre un texto en español
 * apto para el usuario, tomado del catálogo central: nunca el texto crudo del
 * servidor.
 */
export class AppError extends Error {
  constructor(
    readonly kind: AppErrorKind,
    readonly code: string,
    readonly status: number,
    message: string,
    readonly requestId: string | null = null,
    readonly details: readonly FieldIssue[] = [],
    readonly retryAfterSeconds: number | null = null,
    /** Datos que el servidor adjunta a unos pocos errores (p. ej. el estado vigente en `TRIP_VERSION_CONFLICT`); el repositorio que los espera los traduce a dominio. */
    readonly data: unknown = null,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
