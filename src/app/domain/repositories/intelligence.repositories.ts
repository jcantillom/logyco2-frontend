import { Observable } from 'rxjs';
import {
  AreaComparison,
  GroupBreakdown,
  HistoryQuery,
  IndicatorHistory,
  IngestionResult,
  IntelligenceSummary,
  SourceStatus,
} from '../models/intelligence';

/** Indicadores sectoriales (públicos): el backend filtra, agrega y autoriza; Angular solo presenta. */
export abstract class IntelligenceRepository {
  abstract summary(): Observable<IntelligenceSummary>;
  abstract history(code: string, query: HistoryQuery): Observable<IndicatorHistory>;
  abstract areas(code: string): Observable<AreaComparison>;
  abstract ictcGroups(): Observable<GroupBreakdown>;
  abstract sources(): Observable<readonly SourceStatus[]>;
  /** Solo administradores de la plataforma. */
  abstract refreshSource(sourceCode: string): Observable<IngestionResult>;
}
