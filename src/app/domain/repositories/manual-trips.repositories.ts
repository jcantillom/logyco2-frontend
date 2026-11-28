import { Observable } from 'rxjs';
import { ManualOptions, ManualPlace, ManualTemplate, ManualTripInput, ManualTripOutcome, ManualVehicle, RouteDistance, TemplateMode, VoidInput, VoidOutcome } from '../models/manual-trips';

/** Puerto de «registrar viajes uno a uno» y «anular» (`/organizations/{id}/operations/…`, permiso `imports:create`). */
export abstract class ManualTripsRepository {
  /** Fechas admitidas y combustibles con sus unidades. */
  abstract options(organizationId: string): Observable<ManualOptions>;
  /** Vehículos de la empresa por prefijo de placa (activos primero). */
  abstract vehicles(organizationId: string, query: string, limit: number): Observable<ManualVehicle[]>;
  /** Municipios del catálogo (sin tildes). */
  abstract places(organizationId: string, query: string, limit: number): Observable<ManualPlace[]>;
  /** Distancia por ruta entre dos municipios; nunca falla por falta de ruta (`available: false`). */
  abstract routeDistance(organizationId: string, origin: string, destination: string): Observable<RouteDistance>;
  /**
   * Registra un viaje con su `Idempotency-Key`: reenviar la misma clave y el mismo cuerpo devuelve el original (`created: false`).
   * 409 `MANUAL_TRIP_REPEATED` trae los candidatos en `AppError.data` (ya como `RepeatedTrip[]`).
   */
  abstract register(organizationId: string, input: ManualTripInput, idempotencyKey: string): Observable<ManualTripOutcome>;
  /** Anula un viaje manual (nunca se borra). */
  abstract voidTrip(organizationId: string, tripId: string, input: VoidInput): Observable<VoidOutcome>;
  /** Estructura para duplicar un viaje o registrar el de regreso. */
  abstract template(organizationId: string, tripId: string, mode: TemplateMode): Observable<ManualTemplate>;
}
