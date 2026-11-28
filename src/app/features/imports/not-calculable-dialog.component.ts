import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, untracked, inject, input, output, signal, viewChild } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, of, switchMap } from 'rxjs';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ImportDetail, ImportSummary, ReviewIssue } from '../../domain/models/imports';
import { ImportsFacade } from './imports.facade';
import { formatCount } from './imports.labels';

/** Cuántos motivos caben a la vista sin scroll; el resto se resume en «y N más». */
const MAX_LISTED = 4;
/** Hallazgos que dicen qué columna falta o está vacía: el texto lo entrega el servidor. */
const COLUMN_ISSUES: readonly string[] = ['EMPTY_COLUMN', 'MISSING_COLUMN'];

/**
 * Diálogo bloqueante cuando una carga terminó sin ningún viaje calculable (hallazgo `NO_CALCULABLE_TRIPS` del servidor; Angular no lo
 * recalcula). Los viajes ya se guardaron, pero sin CO₂: conservar el archivo exige una confirmación explícita que el servidor guarda y
 * audita. «Cancelar» (foco inicial, Escape) no confirma nada: la carga sigue marcada como sin confirmar en el historial.
 */
@Component({
  selector: 'app-not-calculable-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      dialog.nc { border: 0; padding: 0; border-radius: 18px; left: var(--dlg-left, 0px); width: min(520px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100vh - 48px); background: var(--c-sf); color: var(--c-head); box-shadow: 0 24px 60px color-mix(in srgb, var(--c-head) 30%, transparent); overflow: hidden; }
      dialog.nc::backdrop { background: color-mix(in srgb, var(--c-head) 45%, transparent); }
      .body { padding: 24px 28px; display: grid; gap: 12px; }
      .head { display: flex; gap: 12px; align-items: flex-start; }
      .mark { flex: none; width: 40px; height: 40px; display: grid; place-items: center; border-radius: 50%; background: var(--c-danger-bg); color: var(--c-danger); }
      .mark svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }
      h2 { margin: 0; font-size: 1.25rem; line-height: 1.3; }
      p { margin: 0; color: var(--c-text2); line-height: 1.5; }
      ul { margin: 0; padding-left: 20px; display: grid; gap: 4px; color: var(--c-text2); font-size: 0.95rem; }
      .why { font-weight: 600; color: var(--c-head); font-size: 0.95rem; }
      .err { color: var(--c-danger); font-weight: 600; }
      .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 6px; flex-wrap: wrap; }
    `,
  ],
  template: `
    @if (verdict() === 'show') {
    <dialog #dialog class="nc" role="alertdialog" aria-labelledby="nc-title" aria-describedby="nc-text" (cancel)="onCancel($event)" (close)="closed.emit()" data-testid="not-calculable-dialog">
      <div class="body">
        <div class="head">
          <span class="mark" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M12 8v5M12 17h.01" /><path d="M10.3 4.2 2.8 17.4A2 2 0 0 0 4.5 20.4h15a2 2 0 0 0 1.7-3L13.7 4.2a2 2 0 0 0-3.4 0z" /></svg></span>
          <div>
            <h2 id="nc-title">Con este archivo no se puede calcular ningún viaje</h2>
            <p id="nc-text" data-testid="nc-text">«{{ summary().fileName }}» se leyó, pero ninguno de sus {{ rows() }} viajes tiene datos suficientes para calcular CO₂. No sumará a tu huella hasta que lo completes.</p>
          </div>
        </div>

        @if (listed().length > 0) {
          <p class="why">Qué falta</p>
          <ul data-testid="nc-reasons">
            @for (line of listed(); track line) { <li>{{ line }}</li> }
            @if (hidden() > 0) { <li data-testid="nc-more">y {{ hidden() }} más en la revisión</li> }
          </ul>
        }

        <p data-testid="nc-todo">Completa los datos que faltan en el archivo o descarga la plantilla oficial, y vuelve a subirlo. Si lo conservas así, solo quedará guardado como historial.</p>

        @if (error(); as e) { <p class="err" role="alert" data-testid="nc-error">{{ e.message }}</p> }

        <div class="actions">
          <button type="button" #cancelButton class="btn btn-secondary" data-testid="nc-cancel" (click)="close()">Cancelar</button>
          <button type="button" class="btn btn-primary" data-testid="nc-confirm" [disabled]="saving()" [attr.aria-busy]="saving()" (click)="confirm()">Entiendo, conservar el archivo</button>
        </div>
      </div>
    </dialog>
    }
  `,
})
export class NotCalculableDialogComponent {
  private readonly facade = inject(ImportsFacade);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly cancelButton = viewChild<ElementRef<HTMLButtonElement>>('cancelButton');
  private readonly opener = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);

  readonly summary = input.required<ImportSummary>();
  /** `undefined` mientras el detalle carga; `null` si no se pudo consultar. El detalle es la fuente de verdad: el listado conserva el aviso guardado y NO decide nada. */
  private readonly loaded = toSignal<ImportDetail | null | undefined>(toObservable(this.summary).pipe(switchMap((item) => this.facade.fetch(item.id).pipe(catchError(() => of(null))))), { initialValue: undefined });
  private readonly detail = computed(() => this.loaded() ?? null);
  /**
   * Hasta que llega el detalle no se dibuja nada (ni parpadea el diálogo). Se muestra solo si el servidor dice que NO se puede calcular ni estimando
   * (`not_calculable` presente y `calculable_with_estimation` nulo; un campo ausente cuenta como nulo); si no se pudo consultar, se muestra por prudencia.
   */
  protected readonly verdict = computed<'pending' | 'show' | 'skip'>(() => {
    const detail = this.loaded();

    if (detail === undefined) return 'pending';
    if (detail === null) return 'show';

    return detail.notCalculable && !detail.calculableWithEstimation ? 'show' : 'skip';
  });
  /** Se cerró (con «Cancelar», Escape o tras confirmar). */
  readonly closed = output();

  protected readonly saving = signal(false);
  protected readonly error = signal<AppError | null>(null);
  protected readonly rows = computed(() => formatCount(this.summary().headline?.rowsRead ?? 0));
  /** Motivos de la revisión: filas por motivo pendiente y columnas vacías o ausentes, con el texto del servidor. */
  private readonly lines = computed<readonly string[]>(() => {
    const review = this.detail()?.review;

    if (!review) return [];

    const reasons = review.pendingReasons.map((reason) => `${reason.label}: ${formatCount(reason.rows)} ${reason.rows === 1 ? 'fila' : 'filas'}`);
    const columns = review.issues.filter((issue: ReviewIssue) => COLUMN_ISSUES.includes(issue.code) && issue.severity !== 'INFO').map((issue) => issue.message);

    return [...columns, ...reasons];
  });
  protected readonly listed = computed(() => this.lines().slice(0, MAX_LISTED));
  protected readonly hidden = computed(() => Math.max(0, this.lines().length - MAX_LISTED));

  constructor() {
    effect(() => {
      if (this.verdict() === 'skip') untracked(() => this.closed.emit());
    });
    effect(() => {
      const element = this.dialog()?.nativeElement;

      if (!element) return;

      if (!element.open) element.showModal();

      this.cancelButton()?.nativeElement.focus(); // la opción segura (no confirmar) tiene el foco inicial
    });
  }

  /** Confirma en el servidor (se guarda y se audita una vez); con error la ventana sigue abierta para reintentar o cancelar. */
  protected confirm(): void {
    if (this.saving()) return;

    this.saving.set(true);
    this.error.set(null);
    this.facade.acknowledgeNotCalculable(this.summary().id).subscribe({
      next: () => {
        this.saving.set(false);
        this.close();
      },
      error: (e: unknown) => {
        this.saving.set(false);
        this.error.set(toAppError(e));
      },
    });
  }

  protected close(): void {
    const element = this.dialog()?.nativeElement;

    if (!element) return this.closed.emit();

    if (element.open) element.close();
    else this.closed.emit();

    queueMicrotask(() => this.opener?.isConnected && this.opener.focus());
  }

  /** Escape equivale a «Cancelar», salvo mientras se confirma. */
  protected onCancel(event: Event): void {
    if (this.saving()) event.preventDefault();
  }
}
