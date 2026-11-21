import { ServiceHealth, ServiceStatus } from '../../domain/models/platform';

/** Respuesta de `GET /health/live`. */
export interface LiveDto {
  readonly status?: string;
}
/** Respuesta de `GET /health` (readiness). */
export interface ReadinessDto {
  readonly status?: string;
  readonly database?: string;
}

/** Respuesta de `GET /api/v1/platform/services` (salud del SSO y del directorio, comprobada por el backend). */
export interface CorporateServicesDto {
  readonly items?: readonly { readonly id?: string; readonly status?: string; readonly checked_at?: string | null; readonly detail?: string }[];
}

const CORPORATE: readonly { id: string; name: string }[] = [
  { id: 'sso', name: 'Autenticación SSO LOGYCA' },
  { id: 'directory', name: 'Directorio corporativo LOGYCA' },
];
const STATUSES: readonly ServiceStatus[] = ['UP', 'DEGRADED', 'DOWN', 'UNVERIFIED'];

/** Servicios que hoy NO tienen verificación posible desde el cliente. Nunca se muestran como operativos. */
export const UNVERIFIABLE_SERVICES: readonly { id: string; name: string; detail: string }[] = [
  { id: 'imports', name: 'Procesamiento de archivos', detail: 'Sin endpoint de estado de trabajos.' },
];

export function toApiHealth(live: LiveDto | null, now: Date): ServiceHealth {
  const up = live?.status === 'alive';
  return {
    id: 'api',
    name: 'API de LoGyCO₂ (proceso)',
    status: up ? 'UP' : 'DOWN',
    checkedAt: now,
    detail: up ? 'Responde en /health/live.' : 'No respondió correctamente a /health/live.',
  };
}

/** `ready === null` significa que la consulta falló (503, red): la base de datos queda DOWN o sin verificar. */
export function toDatabaseHealth(ready: ReadinessDto | null, apiReachable: boolean, now: Date): ServiceHealth {
  if (!apiReachable) {
    return { id: 'db', name: 'Base de datos PostgreSQL', status: 'UNVERIFIED', checkedAt: null, detail: 'No se pudo consultar: la API no responde.' };
  }
  const up = ready?.database === 'connected';
  return {
    id: 'db',
    name: 'Base de datos PostgreSQL',
    status: up ? 'UP' : 'DOWN',
    checkedAt: now,
    detail: up ? 'La API confirma la conexión (/health).' : 'La API informa que la base de datos no está disponible.',
  };
}

/**
 * SSO y directorio: el estado lo decide el backend con operaciones de solo lectura. Si la consulta falló (`dto === null`)
 * o el servicio no figura, queda «No verificado»: no haber podido consultar no es lo mismo que «No disponible».
 */
export function toCorporateServices(dto: CorporateServicesDto | null): ServiceHealth[] {
  return CORPORATE.map(({ id, name }) => {
    const item = dto?.items?.find((i) => i.id === id);
    const status = STATUSES.find((s) => s === item?.status);

    if (!item || !status) {
      return { id, name, status: 'UNVERIFIED' as const, checkedAt: null, detail: 'No se pudo consultar el estado a la API.' };
    }

    const checkedAt = item.checked_at ? new Date(item.checked_at) : null;

    return { id, name, status, checkedAt: checkedAt && !Number.isNaN(checkedAt.getTime()) ? checkedAt : null, detail: item.detail ?? '' };
  });
}

export function unverifiedServices(): ServiceHealth[] {
  return UNVERIFIABLE_SERVICES.map((s) => ({ ...s, status: 'UNVERIFIED' as const, checkedAt: null }));
}
