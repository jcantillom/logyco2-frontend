import { DOCUMENT } from '@angular/common';
import { Injectable, OnDestroy, inject, signal } from '@angular/core';
import { EMPTY, Observable, Subscription, forkJoin, tap } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { ImportCounts, ImportCreated, ImportDetail, ImportFilter, ImportSummary } from '../../domain/models/imports';
import { Page } from '../../domain/models/pagination';
import { ImportsRepository } from '../../domain/repositories/imports.repositories';
import { hasVehiclesToReview } from './imports.labels';
import { saveFile } from './save-file';

/** Primera consulta del avance, factor de espera entre consultas y tope. */
export const POLL_FIRST_MS = 1500;
export const POLL_FACTOR = 1.5;
export const POLL_MAX_MS = 5000;
/** Cada cuánto se renueva el historial mientras alguna carga sigue en cola o en revisión. */
export const HISTORY_REFRESH_MS = 3000;
export const HISTORY_PAGE_SIZE = 4;
/** Envíos de archivos al servidor al mismo tiempo; el resto espera su turno. */
export const MAX_CONCURRENT_UPLOADS = 2;

const running = (status: string): boolean => status === 'QUEUED' || status === 'RUNNING';

/** Sigue la carga abierta en el diálogo de revisión hasta que termina: consulta con espera creciente, pausada con la pestaña oculta. */
class ImportWatcher {
  readonly resource = new ScopedResource<ImportDetail>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private waiting: { readonly id: string; readonly delay: number } | null = null;

  constructor(
    private readonly fetch: (id: string) => Observable<ImportDetail>,
    private readonly isHidden: () => boolean,
  ) {}

  watch(id: string): void {
    this.stop();
    this.poll(id, POLL_FIRST_MS);
  }

  /** Consulta pendiente por pestaña oculta: se retoma al volver a verse. */
  resume(hidden: boolean): void {
    if (hidden || !this.waiting) return;

    const { id, delay } = this.waiting;

    this.waiting = null;
    this.poll(id, delay);
  }

  stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);

    this.timer = null;
    this.waiting = null;
  }

  reset(): void {
    this.stop();
    this.resource.reset();
  }

  private poll(id: string, delay: number): void {
    this.resource.load(
      this.fetch(id).pipe(
        tap((detail) => {
          if (running(detail.status)) this.schedule(id, delay);
        }),
      ),
      { keepData: this.resource.data()?.id === id },
    );
  }

  private schedule(id: string, delay: number): void {
    const next = Math.min(Math.round(delay * POLL_FACTOR), POLL_MAX_MS);

    this.timer = setTimeout(() => {
      this.timer = null;

      // Con la pestaña oculta no se consulta: al volver a verse se retoma sin esperar.
      if (this.isHidden()) this.waiting = { id, delay: next };
      else this.poll(id, next);
    }, delay);
  }
}

/** Un archivo que se transfiere al servidor: espera turno, se envía o falló (con su error, para reintentar o descartar). */
export interface UploadEntry {
  readonly id: number;
  readonly file: File;
  readonly status: 'waiting' | 'sending' | 'failed';
  readonly error: AppError | null;
}

/** Qué ofrecer al terminar el lote subido: la ventana de vehículos de un único archivo, o un aviso para varios. */
export type BatchResult = { readonly kind: 'single'; readonly item: ImportSummary } | { readonly kind: 'group'; readonly count: number };

/**
 * Cargas de la empresa activa: plantilla, cola de subida de varios archivos, historial filtrado por estado con sus conteos, avance en
 * vivo y detalle. Todo es de la empresa activa y se descarta, con sus temporizadores, al cambiar de empresa.
 */
@Injectable({ providedIn: 'root' })
export class ImportsFacade implements OnDestroy {
  private readonly repository = inject(ImportsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);
  private readonly document = inject(DOCUMENT);

  readonly list = this.registry.track(new ScopedResource<Page<ImportSummary>>());
  readonly counts = this.registry.track(new ScopedResource<ImportCounts>());
  /** La carga abierta en el diálogo de revisión. */
  private readonly detailWatcher = new ImportWatcher((id) => this.repository.get(this.organizationId(), id), () => this.document.hidden);
  readonly detail = this.detailWatcher.resource;

  readonly page = signal(1);
  readonly filter = signal<ImportFilter>('ALL');
  /** Archivos que se están enviando o esperan turno, y los que fallaron. */
  readonly uploads = signal<readonly UploadEntry[]>([]);
  /** Cuántos archivos de los últimos envíos ya estaban cargados (se avisa una sola vez). */
  readonly duplicates = signal(0);
  /** Aviso de vehículos al terminar el lote subido; `null` si no hay nada que ofrecer. */
  readonly batchResult = signal<BatchResult | null>(null);
  readonly downloading = signal(false);
  readonly downloadError = signal<AppError | null>(null);

  private historyTimer: ReturnType<typeof setTimeout> | null = null;
  private historyPaused = false;
  private nextUploadId = 0;
  private readonly sending = new Map<number, Subscription>();
  /** Cargas creadas por este lote de envíos cuyo resultado aún no se conoce. */
  private readonly batchIds = new Set<string>();
  private readonly onVisibility = (): void => {
    const hidden = this.document.hidden;

    this.detailWatcher.resume(hidden);

    if (!hidden && this.historyPaused) {
      this.historyPaused = false;
      this.loadList();
    }
  };

  constructor() {
    this.registry.track(this.detailWatcher.resource);
    this.registry.track({
      reset: () => {
        this.detailWatcher.stop();
        this.stopHistoryTimer();
        this.sending.forEach((subscription) => subscription.unsubscribe());
        this.sending.clear();
        this.batchIds.clear();
        this.page.set(1);
        this.filter.set('ALL');
        this.uploads.set([]);
        this.duplicates.set(0);
        this.batchResult.set(null);
        this.downloading.set(false);
        this.downloadError.set(null);
      },
    });
    this.document.addEventListener('visibilitychange', this.onVisibility);
  }

  ngOnDestroy(): void {
    this.document.removeEventListener('visibilitychange', this.onVisibility);
    this.detailWatcher.stop();
    this.stopHistoryTimer();
    this.sending.forEach((subscription) => subscription.unsubscribe());
  }

  /**
   * Pide una página del historial con el filtro activo, y los conteos; mientras alguna carga siga en cola o revisión (o falte conocer el
   * resultado de un lote) se vuelve a pedir sola, con la pestaña visible, conservando filtro y página.
   */
  loadList(page = this.page()): void {
    const id = this.organizationIdOrNull();

    if (!id) {
      this.counts.reset();

      return this.list.reset();
    }

    this.page.set(page);
    this.stopHistoryTimer();
    this.list.load(
      this.repository.list(id, { page, pageSize: HISTORY_PAGE_SIZE }, this.filter()).pipe(
        tap((result) => {
          if (result.items.some((item) => running(item.status)) || this.batchIds.size > 0) this.scheduleHistory();

          this.settleBatch(result.items);
        }),
      ),
      { keepData: true },
    );
    this.counts.load(
      this.repository.counts(id).pipe(
        tap((counts) => {
          if (counts.inProgress > 0) this.scheduleHistory();
        }),
      ),
      { keepData: true },
    );
  }

  /** Cambia la pestaña del historial: el filtro viaja al servidor y la lista vuelve a la página 1. */
  setFilter(filter: ImportFilter): void {
    if (filter === this.filter() && this.list.data() !== null) return;

    this.filter.set(filter);
    this.loadList(1);
  }

  /** Pone los archivos en la cola de envío (máximo {@link MAX_CONCURRENT_UPLOADS} a la vez, cada uno con su `Idempotency-Key`). */
  enqueue(files: readonly File[]): void {
    if (files.length === 0) return;

    if (!this.uploads().some((entry) => entry.status !== 'failed')) this.duplicates.set(0);

    // Lo que se acaba de subir se ve en la cola completa, no en una pestaña que podría ocultarlo.
    if (this.filter() !== 'ALL') {
      this.filter.set('ALL');
      this.loadList(1);
    }

    this.uploads.update((all) => [...all, ...files.map((file): UploadEntry => ({ id: this.nextUploadId++, file, status: 'waiting', error: null }))]);
    this.pump();
  }

  /** Vuelve a enviar un archivo que falló, con una clave nueva. */
  retryUpload(entryId: number): void {
    this.patchUpload(entryId, { status: 'waiting', error: null });
    this.pump();
  }

  discardUpload(entryId: number): void {
    this.uploads.update((all) => all.filter((entry) => entry.id !== entryId));
    this.settleBatch(this.list.data()?.items ?? []);
  }

  dismissDuplicates(): void {
    this.duplicates.set(0);
  }

  dismissBatchResult(): void {
    this.batchResult.set(null);
  }

  /** Reintenta una carga fallida: vuelve a entrar en la cola y el historial lo refleja. */
  retry(importId: string): Observable<ImportCreated> {
    return this.repository.retry(this.organizationId(), importId).pipe(tap(() => this.loadList()));
  }

  /** Una carga puntual (para abrir su revisión desde un aviso); la empresa activa es la del contexto. */
  fetch(importId: string): Observable<ImportDetail> {
    const id = this.organizationIdOrNull();

    return id ? this.repository.get(id, importId) : EMPTY;
  }

  /** Vuelve a pedir una carga tras decidir sobre sus vehículos: el detalle abierto y el historial con sus conteos, para que no queden viejos. */
  reloadImport(importId: string): void {
    this.detailWatcher.watch(importId);
    this.loadList();
  }

  openDetail(importId: string): void {
    this.detailWatcher.watch(importId);
  }

  closeDetail(): void {
    this.detailWatcher.reset();
  }

  /** Descarga la plantilla oficial con la sesión y la guarda en el equipo. */
  downloadTemplate(): void {
    if (this.downloading()) return;

    this.downloading.set(true);
    this.downloadError.set(null);

    this.repository.template(this.organizationId()).subscribe({
      next: (file) => {
        saveFile(this.document, file.blob, file.fileName);
        this.downloading.set(false);
      },
      error: (error: unknown) => {
        this.downloading.set(false);
        this.downloadError.set(toAppError(error));
      },
    });
  }

  /** Arranca los envíos que caben en el límite de simultáneos. */
  private pump(): void {
    for (const entry of this.uploads()) {
      if (this.sending.size >= MAX_CONCURRENT_UPLOADS) return;

      if (entry.status === 'waiting') this.send(entry);
    }
  }

  private send(entry: UploadEntry): void {
    this.patchUpload(entry.id, { status: 'sending', error: null });
    this.sending.set(
      entry.id,
      this.repository.upload(this.organizationId(), entry.file, crypto.randomUUID()).subscribe({
        next: (created) => {
          this.sending.delete(entry.id);
          this.uploads.update((all) => all.filter((item) => item.id !== entry.id));

          if (created.duplicate) this.duplicates.update((count) => count + 1);
          else this.batchIds.add(created.id);

          this.pump();
          this.loadList(1);
        },
        error: (error: unknown) => {
          this.sending.delete(entry.id);
          this.patchUpload(entry.id, { status: 'failed', error: toAppError(error) });
          this.pump();
          this.settleBatch(this.list.data()?.items ?? []);
        },
      }),
    );
  }

  private patchUpload(entryId: number, change: Partial<UploadEntry>): void {
    this.uploads.update((all) => all.map((entry) => (entry.id === entryId ? { ...entry, ...change } : entry)));
  }

  /**
   * Cuando ya no quedan envíos pendientes y todas las cargas del lote terminaron, decide qué ofrecer: con un solo archivo, su ventana de
   * vehículos; con varios, un aviso agrupado. Las cargas que no están en la página visible se consultan una vez.
   */
  private settleBatch(visible: readonly ImportSummary[]): void {
    if (this.batchIds.size === 0 || this.uploads().some((entry) => entry.status !== 'failed')) return;

    const organization = this.organizationIdOrNull();
    const ids = [...this.batchIds];
    const known = new Map(visible.map((item) => [item.id, item]));
    const missing = ids.filter((id) => !known.has(id));
    const conclude = (extra: readonly ImportSummary[]): void => {
      const all = [...ids.filter((id) => known.has(id)).map((id) => known.get(id)!), ...extra];

      if (all.length !== ids.length || all.some((item) => running(item.status)) || ids.some((id) => !this.batchIds.has(id))) return;

      ids.forEach((id) => this.batchIds.delete(id));
      const withVehicles = all.filter((item) => item.status === 'COMPLETED' && hasVehiclesToReview(item.vehiclesDetected));

      if (all.length === 1 && withVehicles.length === 1) this.batchResult.set({ kind: 'single', item: withVehicles[0] });
      else if (all.length > 1 && withVehicles.length > 0) this.batchResult.set({ kind: 'group', count: withVehicles.length });
    };

    if (missing.length === 0 || !organization) return conclude([]);

    forkJoin(missing.map((id) => this.repository.get(organization, id))).subscribe({ next: conclude,
      // Una carga que ya no se puede consultar no debe dejar el lote abierto para siempre.
      error: () => ids.forEach((id) => this.batchIds.delete(id)),
    });
  }

  private scheduleHistory(): void {
    if (this.historyTimer !== null) return;

    this.historyTimer = setTimeout(() => {
      this.historyTimer = null;

      if (this.document.hidden) this.historyPaused = true;
      else this.loadList();
    }, HISTORY_REFRESH_MS);
  }

  private stopHistoryTimer(): void {
    if (this.historyTimer !== null) clearTimeout(this.historyTimer);

    this.historyTimer = null;
    this.historyPaused = false;
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
