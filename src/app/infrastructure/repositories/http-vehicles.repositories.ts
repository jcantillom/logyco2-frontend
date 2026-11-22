import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { Page, PageRequest } from '../../domain/models/pagination';
import {
  AnalysisCreated,
  AnalysisSummary,
  ConfirmResult,
  ConfirmSelection,
  Finding,
  FindingFilter,
  NewVehicle,
  NotificationItem,
  ResolveRequest,
  Vehicle,
  VehicleAnalysis,
  VehicleChanges,
  VehicleDetail,
  VehicleFilter,
  VehicleSummary,
} from '../../domain/models/vehicles';
import { NotificationsRepository, PlatformVehiclesRepository, VehiclesRepository } from '../../domain/repositories/vehicles.repositories';
import {
  AnalysisCreatedDto,
  AnalysisSummaryDto,
  ConfirmResultDto,
  FindingDto,
  NotificationDto,
  ReadAllResultDto,
  UnreadCountDto,
  VehicleAnalysisDto,
  VehicleDetailDto,
  VehicleDto,
  VehicleSummaryDto,
} from '../dto/vehicles.dto';
import { ApiClient } from '../http/api-client';
import { toPage } from '../mappers/identity.mappers';
import {
  confirmBody,
  resolveBody,
  toAnalysis,
  toAnalysisCreated,
  toAnalysisSummary,
  toConfirmResult,
  toFinding,
  toNotification,
  toVehicle,
  toVehicleDetail,
  toVehicleSummary,
  vehicleBody,
  vehiclePatchBody,
} from '../mappers/vehicles.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}`;
const platformBase = (organizationId: string): string => `/platform/organizations/${encodeURIComponent(organizationId)}/vehicles`;
const id = (value: string): string => encodeURIComponent(value);

@Injectable()
export class HttpVehiclesRepository extends VehiclesRepository {
  private readonly api = inject(ApiClient);

  summary(organizationId: string): Observable<VehicleSummary> {
    return this.api.get<VehicleSummaryDto>(`${base(organizationId)}/vehicles/summary`).pipe(map(toVehicleSummary));
  }

  list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>> {
    return this.api
      .getPage<VehicleDto>(`${base(organizationId)}/vehicles`, {
        page: request.page,
        page_size: request.pageSize,
        search: filter.search?.trim() || undefined,
        status: filter.status,
        configuration: filter.configuration,
        fuel: filter.fuel,
      })
      .pipe(map((response) => toPage(response, toVehicle)));
  }

  get(organizationId: string, vehicleId: string): Observable<VehicleDetail> {
    return this.api.get<VehicleDetailDto>(`${base(organizationId)}/vehicles/${id(vehicleId)}`).pipe(map(toVehicleDetail));
  }

  create(organizationId: string, vehicle: NewVehicle): Observable<Vehicle> {
    return this.api.post<VehicleDto>(`${base(organizationId)}/vehicles`, vehicleBody(vehicle)).pipe(map(toVehicle));
  }

  update(organizationId: string, vehicleId: string, changes: VehicleChanges): Observable<Vehicle> {
    return this.api.patch<VehicleDto>(`${base(organizationId)}/vehicles/${id(vehicleId)}`, vehiclePatchBody(changes)).pipe(map(toVehicle));
  }

  /** Multipart con la cabecera `Idempotency-Key`. */
  createAnalysis(organizationId: string, file: File, idempotencyKey: string): Observable<AnalysisCreated> {
    const body = new FormData();
    body.append('file', file, file.name);

    return this.api
      .post<AnalysisCreatedDto>(`${base(organizationId)}/vehicle-analyses`, body, { 'Idempotency-Key': idempotencyKey })
      .pipe(map(toAnalysisCreated));
  }

  retryAnalysis(organizationId: string, analysisId: string): Observable<AnalysisCreated> {
    return this.api.post<AnalysisCreatedDto>(`${base(organizationId)}/vehicle-analyses/${id(analysisId)}/retry`, {}).pipe(map(toAnalysisCreated));
  }

  listAnalyses(organizationId: string, request: PageRequest, hasPending = false): Observable<Page<AnalysisSummary>> {
    return this.api
      .getPage<AnalysisSummaryDto>(`${base(organizationId)}/vehicle-analyses`, {
        page: request.page,
        page_size: request.pageSize,
        has_pending: hasPending ? true : undefined,
      })
      .pipe(map((response) => toPage(response, toAnalysisSummary)));
  }

  getAnalysis(organizationId: string, analysisId: string): Observable<VehicleAnalysis> {
    return this.api.get<VehicleAnalysisDto>(`${base(organizationId)}/vehicle-analyses/${id(analysisId)}`).pipe(map(toAnalysis));
  }

  listFindings(organizationId: string, analysisId: string, request: PageRequest, filter: FindingFilter): Observable<Page<Finding>> {
    return this.api
      .getPage<FindingDto>(`${base(organizationId)}/vehicle-analyses/${id(analysisId)}/findings`, {
        page: request.page,
        page_size: request.pageSize,
        state: filter.state,
        decision: filter.decision,
      })
      .pipe(map((response) => toPage(response, toFinding)));
  }

  confirm(organizationId: string, analysisId: string, selection: ConfirmSelection): Observable<ConfirmResult> {
    return this.api
      .post<ConfirmResultDto>(`${base(organizationId)}/vehicle-analyses/${id(analysisId)}/confirm`, confirmBody(selection))
      .pipe(map(toConfirmResult));
  }

  resolve(organizationId: string, findingId: string, request: ResolveRequest): Observable<Finding> {
    return this.api.post<FindingDto>(`${base(organizationId)}/vehicle-findings/${id(findingId)}/resolve`, resolveBody(request)).pipe(map(toFinding));
  }
}

@Injectable()
export class HttpNotificationsRepository extends NotificationsRepository {
  private readonly api = inject(ApiClient);

  list(organizationId: string, request: PageRequest, unreadOnly: boolean): Observable<Page<NotificationItem>> {
    return this.api
      .getPage<NotificationDto>(`${base(organizationId)}/notifications`, {
        page: request.page,
        page_size: request.pageSize,
        unread: unreadOnly ? true : undefined,
      })
      .pipe(map((response) => toPage(response, toNotification)));
  }

  unreadCount(organizationId: string): Observable<number> {
    return this.api.get<UnreadCountDto>(`${base(organizationId)}/notifications/unread-count`).pipe(map((dto) => dto.count));
  }

  markRead(organizationId: string, notificationId: string): Observable<NotificationItem> {
    return this.api.post<NotificationDto>(`${base(organizationId)}/notifications/${id(notificationId)}/read`, {}).pipe(map(toNotification));
  }

  markAllRead(organizationId: string): Observable<number> {
    return this.api.post<ReadAllResultDto>(`${base(organizationId)}/notifications/read-all`, {}).pipe(map((result) => result.updated));
  }
}

/** Misma forma que el inventario de la empresa, bajo `/platform/organizations/{id}/vehicles` (solo lectura). */
@Injectable()
export class HttpPlatformVehiclesRepository extends PlatformVehiclesRepository {
  private readonly api = inject(ApiClient);

  summary(organizationId: string): Observable<VehicleSummary> {
    return this.api.get<VehicleSummaryDto>(`${platformBase(organizationId)}/summary`).pipe(map(toVehicleSummary));
  }

  list(organizationId: string, request: PageRequest, filter: VehicleFilter): Observable<Page<Vehicle>> {
    return this.api
      .getPage<VehicleDto>(platformBase(organizationId), {
        page: request.page,
        page_size: request.pageSize,
        search: filter.search?.trim() || undefined,
        status: filter.status,
        configuration: filter.configuration,
        fuel: filter.fuel,
      })
      .pipe(map((response) => toPage(response, toVehicle)));
  }

  get(organizationId: string, vehicleId: string): Observable<VehicleDetail> {
    return this.api.get<VehicleDetailDto>(`${platformBase(organizationId)}/${id(vehicleId)}`).pipe(map(toVehicleDetail));
  }
}
