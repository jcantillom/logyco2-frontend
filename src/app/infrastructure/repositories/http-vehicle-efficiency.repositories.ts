import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { TemplateFile } from '../../domain/models/imports';
import { PageRequest } from '../../domain/models/pagination';
import { DeclareResult, EfficiencySettings, EfficiencySettingsChange, EfficiencyDeclaration, EfficiencyView, EstimateApplyResult, EstimatePreview, EstimateScope, FichaApplyResult, FichaPreview } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';
import { EfficiencySettingsDto, DeclareOutDto, EfficiencyViewDto, EstimateApplyOutDto, EstimatePreviewDto, FichaApplyOutDto, FichaPreviewDto } from '../dto/vehicle-efficiency.dto';
import { ApiClient } from '../http/api-client';
import { settingsBody, toEfficiencySettings, declareBody, estimateBody, toDeclareResult, toEfficiencyView, toEstimateApplyResult, toEstimatePreview, toFichaApplyResult, toFichaPreview } from '../mappers/vehicle-efficiency.mappers';

/** Nombre con el que se guarda la plantilla si el servidor no informa uno (el mismo que envía el backend). */
export const DEFAULT_FICHA_FILE_NAME = 'ficha-rendimiento-por-vehiculo.xlsx';

const vehicles = (organizationId: string): string => `/organizations/${encodeURIComponent(organizationId)}/vehicles`;

@Injectable()
export class HttpVehicleEfficiencyRepository extends VehicleEfficiencyRepository {
  private readonly api = inject(ApiClient);

  view(organizationId: string, vehicleId: string, request: PageRequest): Observable<EfficiencyView> {
    return this.api
      .get<EfficiencyViewDto>(`${vehicles(organizationId)}/${encodeURIComponent(vehicleId)}/efficiency`, { page: request.page, page_size: request.pageSize })
      .pipe(map(toEfficiencyView));
  }

  declare(organizationId: string, vehicleId: string, declaration: EfficiencyDeclaration): Observable<DeclareResult> {
    return this.api.put<DeclareOutDto>(`${vehicles(organizationId)}/${encodeURIComponent(vehicleId)}/efficiency`, declareBody(declaration)).pipe(map(toDeclareResult));
  }

  template(organizationId: string): Observable<TemplateFile> {
    return this.api.getFile(`${vehicles(organizationId)}/efficiency/template`).pipe(map((file) => ({ blob: file.blob, fileName: file.fileName ?? DEFAULT_FICHA_FILE_NAME })));
  }

  previewFicha(organizationId: string, file: File): Observable<FichaPreview> {
    return this.api.post<FichaPreviewDto>(`${vehicles(organizationId)}/efficiency/ficha/preview`, this.form(file)).pipe(map(toFichaPreview));
  }

  applyFicha(organizationId: string, file: File, token: string, confirmReplaceMeasured = false): Observable<FichaApplyResult> {
    const body = this.form(file);

    body.append('token', token);

    if (confirmReplaceMeasured) body.append('confirm_replace_measured', 'true');

    return this.api.post<FichaApplyOutDto>(`${vehicles(organizationId)}/efficiency/ficha/apply`, body).pipe(map(toFichaApplyResult));
  }

  previewEstimate(organizationId: string, scope: EstimateScope): Observable<EstimatePreview> {
    return this.api.post<EstimatePreviewDto>(`${vehicles(organizationId)}/efficiency/estimate/preview`, estimateBody(scope)).pipe(map(toEstimatePreview));
  }

  applyEstimate(organizationId: string, scope: EstimateScope, token: string): Observable<EstimateApplyResult> {
    return this.api.post<EstimateApplyOutDto>(`${vehicles(organizationId)}/efficiency/estimate/apply`, estimateBody(scope, token)).pipe(map(toEstimateApplyResult));
  }

  private form(file: File): FormData {
    const body = new FormData();

    body.append('file', file, file.name);

    return body;
  }

  settings(organizationId: string): Observable<EfficiencySettings> {
    return this.api.get<EfficiencySettingsDto>(`${vehicles(organizationId)}/efficiency/settings`).pipe(map(toEfficiencySettings));
  }

  updateSettings(organizationId: string, change: EfficiencySettingsChange): Observable<EfficiencySettings> {
    return this.api.put<EfficiencySettingsDto>(`${vehicles(organizationId)}/efficiency/settings`, settingsBody(change)).pipe(map(toEfficiencySettings));
  }
}
