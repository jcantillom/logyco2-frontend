import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ManualOptions, ManualPlace, ManualTemplate, ManualTripInput, ManualTripOutcome, ManualVehicle, RouteDistance, TemplateMode, VoidInput, VoidOutcome } from '../../domain/models/manual-trips';
import { ManualTripsRepository } from '../../domain/repositories/manual-trips.repositories';
import { ManualOptionsDto, ManualPlaceDto, ManualTemplateDto, ManualTripOutDto, ManualVehicleDto, RepeatedDataDto, RouteDistanceDto, VoidOutDto } from '../dto/manual-trips.dto';
import { ApiClient } from '../http/api-client';
import { toManualOptions, toManualPlace, toManualTemplate, toManualTripBody, toManualTripOutcome, toManualVehicle, toRepeatedTrips, toRouteDistance, toVoidBody, toVoidOutcome } from '../mappers/manual-trips.mappers';

const operationsBase = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/operations`;

@Injectable()
export class HttpManualTripsRepository extends ManualTripsRepository {
  private readonly api = inject(ApiClient);

  options(organizationId: string): Observable<ManualOptions> {
    return this.api.get<ManualOptionsDto>(`${operationsBase(organizationId)}/manual/options`).pipe(map(toManualOptions));
  }

  vehicles(organizationId: string, query: string, limit: number): Observable<ManualVehicle[]> {
    return this.api.get<ManualVehicleDto[]>(`${operationsBase(organizationId)}/manual/vehicles`, { q: query, limit }).pipe(map((items) => items.map(toManualVehicle)));
  }

  places(organizationId: string, query: string, limit: number): Observable<ManualPlace[]> {
    return this.api.get<ManualPlaceDto[]>(`${operationsBase(organizationId)}/manual/places`, { q: query, limit }).pipe(map((items) => items.map(toManualPlace)));
  }

  routeDistance(organizationId: string, origin: string, destination: string): Observable<RouteDistance> {
    return this.api.get<RouteDistanceDto>(`${operationsBase(organizationId)}/manual/route-distance`, { origin, destination }).pipe(map(toRouteDistance));
  }

  register(organizationId: string, input: ManualTripInput, idempotencyKey: string): Observable<ManualTripOutcome> {
    return this.api.post<ManualTripOutDto>(`${operationsBase(organizationId)}/trips`, toManualTripBody(input), { 'Idempotency-Key': idempotencyKey }).pipe(
      map(toManualTripOutcome),
      // El 409 de «viaje repetido» trae los candidatos: se entregan ya como dominio para que la pantalla los compare sin otra petición.
      catchError((error: unknown) => {
        const failure = toAppError(error);
        const candidates = failure.code === 'MANUAL_TRIP_REPEATED' && failure.data ? toRepeatedTrips(failure.data as RepeatedDataDto) : null;

        return throwError(() => (candidates ? new AppError(failure.kind, failure.code, failure.status, failure.message, failure.requestId, failure.details, failure.retryAfterSeconds, candidates) : failure));
      }),
    );
  }

  voidTrip(organizationId: string, tripId: string, input: VoidInput): Observable<VoidOutcome> {
    return this.api.post<VoidOutDto>(`${operationsBase(organizationId)}/trips/${encodeURIComponent(tripId)}/void`, toVoidBody(input)).pipe(map(toVoidOutcome));
  }

  template(organizationId: string, tripId: string, mode: TemplateMode): Observable<ManualTemplate> {
    return this.api.get<ManualTemplateDto>(`${operationsBase(organizationId)}/manual/trips/${encodeURIComponent(tripId)}/template`, { mode }).pipe(map(toManualTemplate));
  }
}
