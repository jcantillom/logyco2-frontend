import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { CargoUnit, CargoUnitResult, EfficiencyConsentResult, ImportCounts, ImportPeriod, ImportCreated, ImportDetail, ImportFilter, ImportNotCalculable, ImportSummary, TemplateFile, VehicleCandidate, VehicleCandidateKind, VehicleDecisionRequest, VehicleDecisionResult } from '../../domain/models/imports';
import { Page, PageRequest } from '../../domain/models/pagination';
import { PeriodRange } from '../../domain/models/period';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';
import { CargoUnitResultDto, EfficiencyConsentResultDto, ImportCountsDto, ImportPeriodDto, ImportCreatedDto, ImportDetailDto, ImportNotCalculableDto, ImportSummaryDto, VehicleCandidateDto, VehicleDecisionResultDto } from '../dto/imports.dto';
import { ApiClient } from '../http/api-client';
import { toPage } from '../mappers/identity.mappers';
import { toCargoUnitResult, toConsentBody, toConsentResult, toDecisionBody, toDecisionResult, toImportCounts, toImportPeriod, toImportCreated, toImportDetail, toImportSummary, toNotCalculable, toVehicleCandidate } from '../mappers/imports.mappers';

/** Nombre con el que se guarda la plantilla si el servidor no informa uno (el mismo que envía el backend). */
export const DEFAULT_TEMPLATE_FILE_NAME = 'plantilla_cargas_logyco2.xlsx';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/imports`;
const id = (value: string): string => encodeURIComponent(value);

@Injectable()
export class HttpImportsRepository extends ImportsRepository {
  private readonly api = inject(ApiClient);

  template(organizationId: string): Observable<TemplateFile> {
    return this.api.getFile(`${base(organizationId)}/template`).pipe(map((file) => ({ blob: file.blob, fileName: file.fileName ?? DEFAULT_TEMPLATE_FILE_NAME })));
  }

  /** Multipart con la cabecera `Idempotency-Key`. */
  upload(organizationId: string, file: File, idempotencyKey: string): Observable<ImportCreated> {
    const body = new FormData();

    body.append('file', file, file.name);

    return this.api.post<ImportCreatedDto>(base(organizationId), body, { 'Idempotency-Key': idempotencyKey }).pipe(map(toImportCreated));
  }

  list(organizationId: string, request: PageRequest, filter: ImportFilter): Observable<Page<ImportSummary>> {
    return this.api
      .getPage<ImportSummaryDto>(base(organizationId), { page: request.page, page_size: request.pageSize, filter })
      .pipe(map((response) => toPage(response, toImportSummary)));
  }

  counts(organizationId: string, period?: PeriodRange): Observable<ImportCounts> {
    return this.api.get<ImportCountsDto>(`${base(organizationId)}/counts`, { period_from: period?.from, period_to: period?.to }).pipe(map(toImportCounts));
  }

  periods(organizationId: string): Observable<ImportPeriod[]> {
    return this.api.get<ImportPeriodDto[]>(`${base(organizationId)}/periods`).pipe(map((items) => items.map(toImportPeriod)));
  }

  get(organizationId: string, importId: string): Observable<ImportDetail> {
    return this.api.get<ImportDetailDto>(`${base(organizationId)}/${id(importId)}`).pipe(map(toImportDetail));
  }

  retry(organizationId: string, importId: string): Observable<ImportCreated> {
    return this.api.post<ImportCreatedDto>(`${base(organizationId)}/${id(importId)}/retry`, {}).pipe(map(toImportCreated));
  }

  acknowledgeNotCalculable(organizationId: string, importId: string): Observable<ImportNotCalculable> {
    return this.api.post<ImportNotCalculableDto>(`${base(organizationId)}/${id(importId)}/acknowledge-not-calculable`, {}).pipe(map(toNotCalculable));
  }

  vehicleCandidates(organizationId: string, importId: string, kind: VehicleCandidateKind, request: PageRequest): Observable<Page<VehicleCandidate>> {
    return this.api
      .getPage<VehicleCandidateDto>(`${base(organizationId)}/${id(importId)}/vehicles`, { kind, page: request.page, page_size: request.pageSize })
      .pipe(map((response) => toPage(response, toVehicleCandidate)));
  }

  decideVehicles(organizationId: string, importId: string, request: VehicleDecisionRequest): Observable<VehicleDecisionResult> {
    return this.api.post<VehicleDecisionResultDto>(`${base(organizationId)}/${id(importId)}/vehicles/decisions`, toDecisionBody(request)).pipe(map(toDecisionResult));
  }

  confirmCargoUnit(organizationId: string, importId: string, unit: CargoUnit): Observable<CargoUnitResult> {
    return this.api.post<CargoUnitResultDto>(`${base(organizationId)}/${id(importId)}/cargo-unit`, { unit }).pipe(map(toCargoUnitResult));
  }

  consentEfficiencyEstimation(organizationId: string, importId: string, estimate: boolean): Observable<EfficiencyConsentResult> {
    return this.api.post<EfficiencyConsentResultDto>(`${base(organizationId)}/${id(importId)}/efficiency-estimation`, toConsentBody(estimate)).pipe(map(toConsentResult));
  }
}
