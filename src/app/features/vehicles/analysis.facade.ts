import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { Observable, map, tap } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { Page } from '../../domain/models/pagination';
import {
  AnalysisCreated,
  AnalysisSummary,
  ConfirmResult,
  ConfirmSelection,
  Finding,
  FindingDecision,
  FindingState,
  ResolveAction,
  ResolveRequest,
  VehicleAnalysis,
} from '../../domain/models/vehicles';
import { VehiclesRepository } from '../../domain/repositories/vehicles.repositories';
import { VehiclesFacade } from './vehicles.facade';

/** Primera consulta del avance, factor de espera entre consultas y tope. */
export const POLL_FIRST_MS = 1500;
export const POLL_FACTOR = 1.5;
export const POLL_MAX_MS = 5000;
export const FINDINGS_PAGE_SIZE = 10;
/** Cargas que muestra «Cargas recientes». */
export const RECENT_ANALYSES = 5;

/** Decisión que el servidor deja en el hallazgo tras cada acción (se muestra enseguida y se confirma con su respuesta). */
const DECISION_FOR: Readonly<Record<ResolveAction, FindingDecision>> = {
  KEEP_CURRENT: 'REJECTED',
  ACCEPT_INCOMING: 'CONFIRMED',
  DEFER: 'DEFERRED',
};

/**
 * Asistente «Analizar archivo»: carga del Excel, avance real de la corrida (consulta con espera creciente, pausada con la pestaña
 * oculta), hallazgos por estado y decisiones (confirmar nuevos, resolver inconsistencias). Todo es de la empresa activa y se descarta,
 * con sus temporizadores, al cambiar de empresa.
 */
@Injectable({ providedIn: 'root' })
export class AnalysisFacade implements OnDestroy {
  private readonly repository = inject(VehiclesRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);
  private readonly vehicles = inject(VehiclesFacade);
  private readonly document = inject(DOCUMENT);

  readonly analysis = this.registry.track(new ScopedResource<VehicleAnalysis>());
  readonly newFindings = this.registry.track(new ScopedResource<Page<Finding>>());
  readonly conflicts = this.registry.track(new ScopedResource<Page<Finding>>());
  readonly incomplete = this.registry.track(new ScopedResource<Page<Finding>>());
  readonly invalid = this.registry.track(new ScopedResource<Page<Finding>>());
  readonly recent = this.registry.track(new ScopedResource<Page<AnalysisSummary>>());
  /** La corrida más reciente con algo por decidir (`null` si no hay). */
  readonly latestPending = this.registry.track(new ScopedResource<AnalysisSummary | null>());

  readonly uploading = signal(false);
  readonly uploadError = signal<AppError | null>(null);
  /** `true` si el archivo subido ya se había analizado (se muestra su resultado). */
  readonly duplicate = signal(false);

  private runId: string | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiting: { readonly id: string; readonly delay: number } | null = null;
  private listening = false;
  private readonly onVisibility = (): void => {
    if (this.document.hidden || !this.waiting) return;

    const { id, delay } = this.waiting;

    this.waiting = null;
    this.poll(id, delay);
  };

  constructor() {
    this.registry.track({
      reset: () => {
        this.stopPolling();
        this.runId = null;
        this.uploading.set(false);
        this.uploadError.set(null);
        this.duplicate.set(false);
      },
    });
  }

  ngOnDestroy(): void {
    this.stopPolling();
  }

  /** Sube el archivo con una `Idempotency-Key` nueva por intento: reintentar el mismo envío no crea otra corrida. */
  upload(file: File): Observable<AnalysisCreated> {
    this.uploading.set(true);
    this.uploadError.set(null);
    this.duplicate.set(false);

    return this.repository.createAnalysis(this.organizationId(), file, crypto.randomUUID()).pipe(
      tap({
        next: (created) => {
          this.uploading.set(false);
          this.duplicate.set(created.duplicate);
          this.loadRecent();
          this.loadLatestPending();
        },
        error: (error: unknown) => {
          this.uploading.set(false);
          this.uploadError.set(toAppError(error));
        },
      }),
    );
  }

  /** Reintenta una corrida fallida y vuelve a seguir su avance. */
  retry(analysisId: string): Observable<AnalysisCreated> {
    return this.repository.retryAnalysis(this.organizationId(), analysisId).pipe(tap((created) => this.watch(created.id)));
  }

  /** Empieza a seguir una corrida: consulta ya y repite hasta que termine. Al completarse carga sus hallazgos. */
  watch(analysisId: string): void {
    this.stopPolling();
    this.runId = analysisId;
    this.document.addEventListener('visibilitychange', this.onVisibility);
    this.listening = true;
    this.poll(analysisId, POLL_FIRST_MS);
  }

  /** Deja de seguir la corrida y descarta lo cargado (volver a «Cargar archivo» o cerrar el asistente). */
  clear(): void {
    this.stopPolling();
    this.runId = null;
    this.analysis.reset();
    this.newFindings.reset();
    this.conflicts.reset();
    this.incomplete.reset();
    this.invalid.reset();
  }

  loadState(state: Exclude<FindingState, 'KNOWN'>, page = 1): void {
    const id = this.organizationIdOrNull();

    if (!id || !this.runId) return;

    const resource = { NEW: this.newFindings, CONFLICT: this.conflicts, INCOMPLETE: this.incomplete, INVALID: this.invalid }[state];
    // Los nuevos solo se listan mientras faltan por decidir; las demás listas conservan lo ya resuelto para que la tarjeta no desaparezca.
    const decision = state === 'NEW' ? 'PENDING' : undefined;

    resource.load(this.repository.listFindings(id, this.runId, { page, pageSize: FINDINGS_PAGE_SIZE }, { state, decision }), { keepData: true });
  }

  loadRecent(): void {
    const id = this.organizationIdOrNull();

    if (!id) return this.recent.reset();

    this.recent.load(this.repository.listAnalyses(id, { page: 1, pageSize: RECENT_ANALYSES }), { keepData: true });
  }

  loadLatestPending(): void {
    const id = this.organizationIdOrNull();

    if (!id) return this.latestPending.reset();

    this.latestPending.load(
      this.repository.listAnalyses(id, { page: 1, pageSize: 1 }, true).pipe(map((page) => page.items[0] ?? null)),
      { keepData: true },
    );
  }

  confirm(selection: ConfirmSelection): Observable<ConfirmResult> {
    return this.repository.confirm(this.organizationId(), this.requireRun(), selection).pipe(
      tap(() => {
        this.loadState('NEW');
        this.refreshInventory();
      }),
    );
  }

  /** Resuelve una inconsistencia: la decisión se muestra enseguida y se revierte si el servidor la rechaza. */
  resolve(finding: Finding, request: ResolveRequest): Observable<Finding> {
    const before = { conflicts: this.conflicts.data(), incomplete: this.incomplete.data() };

    this.patch(finding.id, { ...finding, decision: DECISION_FOR[request.action] });

    return this.repository.resolve(this.organizationId(), finding.id, request).pipe(
      tap({
        next: (updated) => {
          this.patch(finding.id, updated);
          this.refreshInventory();
        },
        error: () => {
          this.conflicts.data.set(before.conflicts);
          this.incomplete.data.set(before.incomplete);
        },
      }),
    );
  }

  private patch(findingId: string, next: Finding): void {
    for (const resource of [this.conflicts, this.incomplete]) {
      resource.data.update((page) => (page ? { ...page, items: page.items.map((f) => (f.id === findingId ? next : f)) } : page));
    }
  }

  private refreshInventory(): void {
    this.vehicles.loadSummary();
    this.vehicles.loadList();
    this.loadRecent();
    this.loadLatestPending();
  }

  private poll(id: string, delay: number): void {
    const orgId = this.organizationIdOrNull();

    if (!orgId) return;

    this.analysis.load(
      this.repository.getAnalysis(orgId, id).pipe(
        tap((analysis) => {
          if (analysis.status === 'QUEUED' || analysis.status === 'RUNNING') return this.schedule(id, delay);

          this.stopTimer();

          if (analysis.status === 'COMPLETED') {
            this.loadState('NEW');
            this.loadState('CONFLICT');
            this.loadState('INCOMPLETE');
            this.loadState('INVALID');
          }
        }),
      ),
      { keepData: this.analysis.data()?.id === id },
    );
  }

  private schedule(id: string, delay: number): void {
    const next = Math.min(Math.round(delay * POLL_FACTOR), POLL_MAX_MS);

    this.timer = setTimeout(() => {
      this.timer = null;

      // Con la pestaña oculta no se consulta: al volver a verse se retoma sin esperar.
      if (this.document.hidden) this.waiting = { id, delay: next };
      else this.poll(id, next);
    }, delay);
  }

  private stopPolling(): void {
    this.stopTimer();
    this.waiting = null;

    if (this.listening) this.document.removeEventListener('visibilitychange', this.onVisibility);

    this.listening = false;
  }

  private stopTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);

    this.timer = null;
  }

  private requireRun(): string {
    if (!this.runId) throw new Error('No hay un análisis abierto.');

    return this.runId;
  }

  private organizationIdOrNull(): string | null {
    return this.context.activeOrganizationId();
  }

  private organizationId(): string {
    const id = this.organizationIdOrNull();

    if (!id) throw new Error('No hay una empresa activa.');

    return id;
  }
}
