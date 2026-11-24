import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Subscription } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ExportJob, OperationsFilter, OperationsView } from '../../domain/models/operations';
import { OperationsRepository } from '../../domain/repositories/operations.repositories';
import { saveFile } from '../imports/save-file';
import { isActive, statusText } from './operation-exports.view';

/** Cada cuánto se consulta mientras algún reporte esté en cola o generándose. */
export const EXPORTS_POLL_MS = 2000;
/** Tope de la espera entre consultas tras errores seguidos (2 s, 4 s, 8 s… hasta 30 s). */
export const EXPORTS_MAX_BACKOFF_MS = 30_000;

export type ExportsStatus = 'idle' | 'loading' | 'ready' | 'error';

/**
 * Reportes Excel en segundo plano de la empresa activa: los trabajos viven en el servidor (recargar la página no los pierde), aquí solo se muestran y se vigilan.
 *
 * - Consulta la lista cada 2 s MIENTRAS haya un trabajo activo y se detiene sola cuando no queda ninguno; con la pestaña oculta no consulta y al volver consulta de inmediato.
 * - Un error de red alarga la espera de forma exponencial (hasta 30 s) y se recupera solo; no se pierde lo ya mostrado.
 * - `stop()` (al salir de la pantalla) y el cambio de empresa cancelan la consulta en vuelo y el temporizador.
 * - Cada cambio de estado de un trabajo se anuncia en `announcement` (región `aria-live` educada).
 */
@Injectable({ providedIn: 'root' })
export class OperationExportsFacade {
  private readonly repository = inject(OperationsRepository);
  private readonly context = inject(OrganizationContext);
  private readonly registry = inject(ContextResetRegistry);
  private readonly document = inject(DOCUMENT);

  readonly jobs = signal<readonly ExportJob[]>([]);
  readonly status = signal<ExportsStatus>('idle');
  readonly error = signal<AppError | null>(null);
  readonly requesting = signal(false);
  /** Ids con una acción en curso (cancelando o descargando). */
  readonly busy = signal<ReadonlySet<string>>(new Set());
  readonly actionError = signal<AppError | null>(null);
  readonly panelOpen = signal(false);
  readonly announcement = signal('');

  readonly active = computed(() => this.jobs().filter(isActive));
  /** Lo que importa a simple vista: reportes en marcha más los listos para descargar. */
  readonly liveCount = computed(() => this.jobs().filter((job) => isActive(job) || job.downloadable).length);

  private timer: ReturnType<typeof setTimeout> | null = null;
  private fetching: Subscription | null = null;
  private readonly downloads = new Map<string, Subscription>();
  private failures = 0;
  private running = false;
  /** Cambia solo al cambiar de empresa: las respuestas de acciones (pedir, cancelar, descargar) de la empresa anterior se descartan. */
  private epoch = 0;
  /** Cambia con cada consulta de la lista y al detener la vigilancia: solo cuenta la última. */
  private listing = 0;
  private readonly watching = new Map<string, string>();
  private readonly onVisibility = (): void => {
    if (!this.running) return;

    if (this.document.visibilityState === 'hidden') return this.clearTimer();

    this.refresh();
  };

  constructor() {
    this.registry.track({ reset: () => this.reset() });
  }

  /** Empieza a vigilar (al entrar a la pantalla o al cambiar de empresa): pide la lista y, si hay algo activo, sigue consultando. */
  load(): void {
    if (!this.running) this.document.addEventListener('visibilitychange', this.onVisibility);

    this.running = true;
    this.refresh();
  }

  /** Deja de vigilar (al salir de la pantalla): cancela la consulta en vuelo y el temporizador; lo mostrado se conserva. */
  stop(): void {
    this.running = false;
    this.listing++;
    this.clearTimer();
    this.fetching?.unsubscribe();
    this.fetching = null;
    // Una descarga a medias al salir de la pantalla se cancela: el archivo no se guarda en silencio después.
    this.downloads.forEach((request) => request.unsubscribe());
    this.downloads.clear();
    this.busy.set(new Set());
    this.document.removeEventListener('visibilitychange', this.onVisibility);
  }

  togglePanel(): void {
    this.panelOpen.update((open) => !open);
  }

  openPanel(): void {
    this.panelOpen.set(true);
  }

  closePanel(): void {
    this.panelOpen.set(false);
  }

  /** Pide un reporte con los filtros y la pestaña actuales; `done` recibe el error (o `null` si quedó en cola). */
  request(filter: OperationsFilter, view: OperationsView, done?: (error: AppError | null) => void): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.requesting()) return;

    const epoch = this.epoch;

    this.requesting.set(true);
    this.actionError.set(null);
    // Una consulta de la lista en vuelo se cancela: su respuesta (anterior al pedido) no puede pisar el trabajo nuevo.
    this.fetching?.unsubscribe();
    this.fetching = null;
    this.listing++;
    this.clearTimer();
    this.repository.createExport(organizationId, filter, view).subscribe({
      next: (job) => {
        if (epoch !== this.epoch) return;

        this.requesting.set(false);
        this.merge(job);
        this.watching.set(job.id, job.status);
        this.announcement.set('Reporte en cola. Puedes seguir trabajando; te avisamos aquí cuando esté listo.');
        this.panelOpen.set(true);
        this.status.set('ready');
        this.schedule();
        done?.(null);
      },
      error: (error: unknown) => {
        if (epoch !== this.epoch) return;

        this.requesting.set(false);
        done?.(toAppError(error));

        if (this.running) this.refresh();  // retoma la vigilancia que se cortó al pedir
      },
    });
  }

  cancel(jobId: string): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy().has(jobId)) return;

    const epoch = this.epoch;

    this.markBusy(jobId, true);
    this.actionError.set(null);
    this.repository.cancelExport(organizationId, jobId).subscribe({
      next: (job) => {
        if (epoch !== this.epoch) return;

        this.markBusy(jobId, false);
        this.merge(job);
        this.watching.set(job.id, job.status);
        this.announcement.set('Reporte cancelado.');
      },
      error: (error: unknown) => {
        if (epoch !== this.epoch) return;

        this.markBusy(jobId, false);
        this.actionError.set(toAppError(error));

        if (this.running) this.refresh();
      },
    });
  }

  download(jobId: string): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || this.busy().has(jobId)) return;

    const epoch = this.epoch;

    this.markBusy(jobId, true);
    this.actionError.set(null);
    const request = this.repository.downloadExport(organizationId, jobId).subscribe({
      next: (file) => {
        if (epoch !== this.epoch) return;

        saveFile(this.document, file.blob, file.fileName);
        this.downloads.delete(jobId);
        this.markBusy(jobId, false);
      },
      error: (error: unknown) => {
        if (epoch !== this.epoch) return;

        this.downloads.delete(jobId);
        this.markBusy(jobId, false);
        this.actionError.set(toAppError(error));

        if (this.running) this.refresh();
      },
    });

    if (!request.closed) this.downloads.set(jobId, request);
  }

  /** Una consulta de la lista; la anterior en vuelo se cancela (nunca dos a la vez). */
  private refresh(): void {
    const organizationId = this.context.activeOrganizationId();

    this.clearTimer();
    this.fetching?.unsubscribe();

    if (!organizationId) {
      this.fetching = null;

      return;
    }

    const generation = ++this.listing;

    if (this.status() !== 'ready') this.status.set('loading');

    this.fetching = this.repository.listExports(organizationId).subscribe({
      next: (jobs) => {
        if (generation !== this.listing) return;

        this.failures = 0;
        this.error.set(null);
        this.status.set('ready');
        this.announceChanges(jobs);
        this.jobs.set(jobs);
        this.schedule();
      },
      error: (error: unknown) => {
        if (generation !== this.listing) return;

        this.failures++;
        this.error.set(toAppError(error));
        this.status.set(this.jobs().length ? 'ready' : 'error');
        this.schedule();
      },
    });
  }

  /** La próxima consulta: solo si se está vigilando, la pestaña está visible y hay algo activo (o se está recuperando de un error con algo activo). */
  private schedule(): void {
    this.clearTimer();

    if (!this.running || this.document.visibilityState === 'hidden' || this.active().length === 0) return;

    const wait = Math.min(EXPORTS_MAX_BACKOFF_MS, EXPORTS_POLL_MS * 2 ** this.failures);

    this.timer = setTimeout(() => this.refresh(), wait);
  }

  /** Anuncia una sola vez cada cambio de estado de un trabajo que se está vigilando (en cola → generando → listo, falló, cancelado, vencido). */
  private announceChanges(jobs: readonly ExportJob[]): void {
    for (const job of jobs) {
      const before = this.watching.get(job.id);

      if (before !== undefined && before !== job.status) {
        this.announcement.set(
          job.status === 'COMPLETED' ? 'Reporte listo para descargar.' : job.status === 'FAILED' ? 'El reporte falló.' : job.status === 'RUNNING' ? `Reporte ${statusText(job).toLowerCase()}.` : job.status === 'CANCELED' ? 'Reporte cancelado.' : job.status === 'EXPIRED' ? 'El reporte venció.' : '',
        );
      }

      if (isActive(job)) this.watching.set(job.id, job.status);
      else if (before !== undefined && before !== job.status) this.watching.delete(job.id);
    }
  }

  private merge(job: ExportJob): void {
    this.jobs.update((jobs) => [job, ...jobs.filter((item) => item.id !== job.id)]);
  }

  private markBusy(jobId: string, busy: boolean): void {
    this.busy.update((ids) => {
      const next = new Set(ids);

      if (busy) next.add(jobId);
      else next.delete(jobId);

      return next;
    });
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);

    this.timer = null;
  }

  private reset(): void {
    this.epoch++;
    this.stop();
    this.failures = 0;
    this.jobs.set([]);
    this.status.set('idle');
    this.error.set(null);
    this.requesting.set(false);
    this.busy.set(new Set());
    this.actionError.set(null);
    this.panelOpen.set(false);
    this.announcement.set('');
    this.watching.clear();
  }
}
