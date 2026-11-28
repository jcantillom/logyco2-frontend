import { Observable } from 'rxjs';
import { TemplateFile } from '../models/imports';
import { PageRequest } from '../models/pagination';
import { DeclareResult, EfficiencySettings, EfficiencySettingsChange, EfficiencyDeclaration, EfficiencyView, EstimateApplyResult, EstimatePreview, EstimateScope, FichaApplyResult, FichaPreview } from '../models/vehicle-efficiency';

/** Puerto del rendimiento declarado por vehículo y de la «Ficha por vehículo» (Excel) de la empresa activa. */
export abstract class VehicleEfficiencyRepository {
  abstract view(organizationId: string, vehicleId: string, request: PageRequest): Observable<EfficiencyView>;
  /** Idempotente: repetir la misma declaración no crea otro registro y continúa el recálculo de los pendientes. */
  abstract declare(organizationId: string, vehicleId: string, declaration: EfficiencyDeclaration): Observable<DeclareResult>;
  abstract template(organizationId: string): Observable<TemplateFile>;
  abstract previewFicha(organizationId: string, file: File): Observable<FichaPreview>;
  /** Con el MISMO archivo de la vista previa y su token. */
  /** `confirmReplaceMeasured`: reemplazar también los medidos vigentes (por defecto no; solo se envía si es `true`). */
  abstract applyFicha(organizationId: string, file: File, token: string, confirmReplaceMeasured?: boolean): Observable<FichaApplyResult>;
  /** Vista previa de lo que estimaría la referencia técnica: no guarda nada. 404 `ESTIMATION_DISABLED` si está apagada. */
  abstract previewEstimate(organizationId: string, scope: EstimateScope): Observable<EstimatePreview>;
  /** Con el MISMO alcance de la vista previa y su token; idempotente. */
  abstract applyEstimate(organizationId: string, scope: EstimateScope, token: string): Observable<EstimateApplyResult>;
  /** Ajustes de la empresa para la importación (estimación del rendimiento y unidad de la carga); leerlos pide `vehicles:read`. */
  abstract settings(organizationId: string): Observable<EfficiencySettings>;
  /** Cambia el modo de estimación y/o el de la unidad de la carga (solo ORG_ADMIN, `vehicles:manage`); lo omitido no cambia. */
  abstract updateSettings(organizationId: string, change: EfficiencySettingsChange): Observable<EfficiencySettings>;
}
