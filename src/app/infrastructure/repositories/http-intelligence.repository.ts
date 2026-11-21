import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { AreaComparison, GroupBreakdown, HistoryQuery, IndicatorHistory, IngestionResult, IntelligenceSummary, SourceStatus } from '../../domain/models/intelligence';
import { IntelligenceRepository } from '../../domain/repositories/intelligence.repositories';
import { ApiClient } from '../http/api-client';
import {
  AreasDto, GroupsDto, HistoryDto, IngestionDto, SummaryDto, SourceStatusDto, toAreas, toGroups, toHistory, toIngestion, toSourceStatus, toSummary,
} from '../mappers/intelligence.mappers';

@Injectable()
export class HttpIntelligenceRepository extends IntelligenceRepository {
  private readonly api = inject(ApiClient);

  summary(): Observable<IntelligenceSummary> {
    return this.api.get<SummaryDto>('/intelligence/summary').pipe(map(toSummary));
  }

  history(code: string, query: HistoryQuery): Observable<IndicatorHistory> {
    return this.api
      .get<HistoryDto>(`/intelligence/indicators/${encodeURIComponent(code)}/history`, { area_code: query.areaCode, date_from: query.dateFrom })
      .pipe(map(toHistory));
  }

  areas(code: string): Observable<AreaComparison> {
    return this.api.get<AreasDto>(`/intelligence/indicators/${encodeURIComponent(code)}/areas`).pipe(map(toAreas));
  }

  ictcGroups(): Observable<GroupBreakdown> {
    return this.api.get<GroupsDto>('/intelligence/ictc/groups').pipe(map(toGroups));
  }

  sources(): Observable<readonly SourceStatus[]> {
    return this.api.get<{ items: SourceStatusDto[] }>('/intelligence/sources').pipe(map((r) => r.items.map(toSourceStatus)));
  }

  refreshSource(sourceCode: string): Observable<IngestionResult> {
    return this.api.post<IngestionDto>(`/intelligence/sources/${encodeURIComponent(sourceCode)}/refresh`, {}).pipe(map(toIngestion));
  }

}
