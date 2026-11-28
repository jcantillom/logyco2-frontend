import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, throwError } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { Granularity } from '../../domain/models/granularity';
import { BulkApplyResult, BulkPreview, BulkScope, CompletionInput, CompletionPlatesPage, CompletionPlatesRequest, CompletionOutcome, CompletionState, ExportJob, OperationsFilter, OperationsListRequest, OperationsPage, OperationsView, ReportFile, TabCounts, TripDetail } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { BulkApplyDto, BulkPreviewDto, CompletionOutDto, CompletionPlatesPageDto, CompletionStateDto, ExportJobDto, OperationsPageDto, TabCountsDto, TripDetailDto } from '../dto/operations.dto';
import { ApiClient, QueryParams } from '../http/api-client';
import { toBulkApplyResult, toBulkPreview, toBulkScopeBody, toCompletionBody, toCompletionOutcome, toCompletionPlatesPage, toCompletionState, toExportJob, toOperationsPage, toTabCounts, toTripDetail } from '../mappers/operations.mappers';

const base = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/operations/trips`;

const completionsBase = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/operations/completions`;

const exportsBase = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/operations/exports`;

/** Los filtros que comparten el listado y el resumen; lo vacío no se envía. */
const filterParams = (filter: OperationsFilter): QueryParams => ({
  status: filter.status,
  fuel: filter.fuel,
  import_file_id: filter.importFileId,
  from: filter.from,
  to: filter.to,
  dedup: filter.dedup,
  q: filter.query,
});

/** Nombre de respaldo si el navegador no puede leer `Content-Disposition`: `operaciones-logisticas_<yyyymmdd>.xlsx` con la fecha local. */
export const defaultReportFileName = (now: Date = new Date()): string =>
  `operaciones-logisticas_${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}.xlsx`;

@Injectable()
export class HttpOperationsRepository extends OperationsRepository {
  private readonly api = inject(ApiClient);

  list(organizationId: string, filter: OperationsFilter, request: OperationsListRequest): Observable<OperationsPage> {
    return this.api
      .getBody<OperationsPageDto>(base(organizationId), { ...filterParams(filter), view: request.view, limit: request.limit, cursor: request.cursor || undefined })
      .pipe(map(toOperationsPage));
  }

  summary(organizationId: string, filter: OperationsFilter): Observable<TabCounts> {
    return this.api.get<TabCountsDto>(`${base(organizationId)}/summary`, filterParams(filter)).pipe(map(toTabCounts));
  }

  exportReport(organizationId: string, filter: OperationsFilter, view: OperationsView, granularity: Granularity): Observable<ReportFile> {
    return this.api
      .getFile(`${base(organizationId)}/export`, { ...filterParams(filter), view, granularity })
      .pipe(map((file) => ({ blob: file.blob, fileName: file.fileName ?? defaultReportFileName() })));
  }

  createExport(organizationId: string, filter: OperationsFilter, view: OperationsView, granularity: Granularity): Observable<ExportJob> {
    // El cuerpo es el mismo conjunto de parámetros del listado; lo vacío no se envía.
    const body = Object.fromEntries(Object.entries({ ...filterParams(filter), view, granularity }).filter(([, value]) => value !== undefined));

    return this.api.post<ExportJobDto>(exportsBase(organizationId), body).pipe(map(toExportJob));
  }

  listExports(organizationId: string): Observable<ExportJob[]> {
    return this.api.get<ExportJobDto[]>(exportsBase(organizationId)).pipe(map((jobs) => jobs.map(toExportJob)));
  }

  cancelExport(organizationId: string, exportId: string): Observable<ExportJob> {
    return this.api.post<ExportJobDto>(`${exportsBase(organizationId)}/${encodeURIComponent(exportId)}/cancel`, {}).pipe(map(toExportJob));
  }

  downloadExport(organizationId: string, exportId: string): Observable<ReportFile> {
    return this.api
      .getFile(`${exportsBase(organizationId)}/${encodeURIComponent(exportId)}/download`)
      .pipe(map((file) => ({ blob: file.blob, fileName: file.fileName ?? defaultReportFileName() })));
  }

  detail(organizationId: string, tripId: string): Observable<TripDetail> {
    return this.api.get<TripDetailDto>(`${base(organizationId)}/${encodeURIComponent(tripId)}`).pipe(map(toTripDetail));
  }

  completionState(organizationId: string, tripId: string): Observable<CompletionState> {
    return this.api.get<CompletionStateDto>(`${base(organizationId)}/${encodeURIComponent(tripId)}/completion`).pipe(map(toCompletionState));
  }

  complete(organizationId: string, tripId: string, input: CompletionInput): Observable<CompletionOutcome> {
    return this.api.patch<CompletionOutDto>(`${base(organizationId)}/${encodeURIComponent(tripId)}/completion`, toCompletionBody(input)).pipe(
      map(toCompletionOutcome),
      // El 409 de versión trae el estado vigente: se entrega ya como dominio para que la pantalla refresque el formulario sin otra petición.
      catchError((error: unknown) => {
        const failure = toAppError(error);
        const fresh = failure.code === 'TRIP_VERSION_CONFLICT' && failure.data ? toCompletionState(failure.data as CompletionStateDto) : null;

        return throwError(() => (fresh ? new AppError(failure.kind, failure.code, failure.status, failure.message, failure.requestId, failure.details, failure.retryAfterSeconds, fresh) : failure));
      }),
    );
  }

  completionPlates(organizationId: string, request: CompletionPlatesRequest): Observable<CompletionPlatesPage> {
    return this.api
      .getBody<CompletionPlatesPageDto>(`${completionsBase(organizationId)}/plates`, {
        reason: 'DISTANCE_WITHOUT_EFFICIENCY',
        import_file_id: request.importFileId ?? undefined,
        q: request.query || undefined,
        limit: request.limit,
        cursor: request.cursor ?? undefined,
      })
      .pipe(map(toCompletionPlatesPage));
  }

  previewCompletion(organizationId: string, scope: BulkScope): Observable<BulkPreview> {
    return this.api.post<BulkPreviewDto>(`${completionsBase(organizationId)}/preview`, toBulkScopeBody(scope)).pipe(map(toBulkPreview));
  }

  applyCompletion(organizationId: string, scope: BulkScope, token: string): Observable<BulkApplyResult> {
    return this.api.post<BulkApplyDto>(`${completionsBase(organizationId)}/apply`, { ...toBulkScopeBody(scope), token }).pipe(map(toBulkApplyResult));
  }
}
