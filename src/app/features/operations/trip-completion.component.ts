import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { CompletionField, CompletionOutcome, CompletionState } from '../../domain/models/operations';
import { CompletionMode } from './trip-completion.facade';
import { groupFields, rangeText, resultMessage } from './completion.view';

/**
 * «Completar datos»: el formulario con SOLO los datos que el servidor dice que faltan (etiqueta, opciones, rango y ayuda vienen de él; no hay valores por defecto ni reglas aquí) y,
 * después de guardar, el resultado que el servidor recalculó. Presentacional: el estado y los pedidos viven en `TripCompletionFacade`.
 */
@Component({
  selector: 'app-trip-completion',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; min-width: 0; }
      .cf { display: grid; gap: 6px; align-content: start; }
      h3 { margin: 0; font-size: 0.78rem; font-weight: 700; color: var(--c-accent); }
      h3:focus { outline: none; }
      .lead { margin: 0; font-size: 0.8rem; color: var(--c-text2); }
      .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 6px 10px; }
      fieldset { display: grid; gap: 2px; min-width: 0; margin: 0; padding: 0; border: 0; }
      fieldset.pair { grid-column: 1 / -1; }
      legend { padding: 0; font-size: 0.72rem; font-weight: 700; color: var(--c-head); }
      .ctl { display: grid; grid-template-columns: minmax(0, 1fr); gap: 6px; }
      .pair .ctl { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      .f { display: grid; gap: 1px; min-width: 0; }
      .f > label { font-size: 0.72rem; color: var(--c-mu); }
      .f .input { width: 100%; box-sizing: border-box; min-height: 34px; padding-block: 4px; }
      .f small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 0.68rem; line-height: 1.25; color: var(--c-mu); }
      .f small.bad { white-space: normal; color: var(--c-danger); font-weight: 600; }
      .notice { margin: 0; padding: 6px 10px; border-radius: 8px; background: var(--c-warning-bg); color: var(--c-warning); font-size: 0.78rem; }
      .alert { margin: 0; padding: 8px 10px; font-size: 0.8rem; }
      .acts { display: flex; flex-wrap: wrap; gap: 6px; }
      .acts .btn { min-height: 34px; padding: 0 12px; font-size: 0.8rem; }
      .msg { margin: 0; font-size: 1rem; font-weight: 700; color: var(--c-head); }
      .note { margin: 0; font-size: 0.8rem; color: var(--c-text2); }
      .skel i { display: block; height: 14px; margin: 10px 0; border-radius: 6px; background: linear-gradient(90deg, var(--c-s3) 25%, var(--c-s2) 50%, var(--c-s3) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
      @keyframes shimmer { to { background-position: -200% 0; } }
      @media (prefers-reduced-motion: reduce) { .skel i { animation: none; } }
    `,
  ],
  template: `
    <section class="cf" aria-labelledby="completion-title" data-testid="completion" [attr.aria-busy]="saving() || status() === 'loading'">
      <h3 id="completion-title" tabindex="-1" #title>{{ mode() === 'done' ? 'Datos guardados' : 'Completar datos' }}</h3>

      @if (mode() === 'done' && outcome(); as o) {
        <p class="msg" data-testid="completion-message">{{ message(o.result) }}</p>
        @if (o.result.countedNote) { <p class="note" data-testid="completion-note">{{ o.result.countedNote }}</p> }
        <div class="acts">
          @if (o.result.status === 'PENDING' && o.trip.completable) { <button type="button" class="btn btn-secondary" data-testid="completion-continue" (click)="continue.emit()">Seguir completando</button> }
          @if (canNext()) { <button type="button" class="btn btn-secondary" data-testid="completion-next" (click)="next.emit()">Siguiente por completar</button> }
          <button type="button" class="btn btn-primary" data-testid="completion-done" (click)="finished.emit()">Listo</button>
        </div>
      } @else {
        @switch (status()) {
          @case ('error') {
            <p class="alert alert-danger" role="alert" data-testid="completion-load-error">{{ loadError()?.message ?? 'No se pudo cargar el formulario.' }}</p>
            <div class="acts"><button type="button" class="btn btn-secondary" data-testid="completion-retry" (click)="retry.emit()">Reintentar</button><button type="button" class="btn btn-secondary" (click)="dismissed.emit()">Cancelar</button></div>
          }
          @case ('ready') {
            @if (state(); as s) {
              @if (!s.completable) {
                <p class="alert alert-warning" role="status" data-testid="completion-refusal">{{ s.refusal ?? 'Este viaje no se puede completar en pantalla.' }}</p>
                <div class="acts"><button type="button" class="btn btn-secondary" data-testid="completion-cancel" (click)="dismissed.emit()">Cerrar</button></div>
              } @else {
                <form (submit)="submit($event)" novalidate data-testid="completion-form">
                  @if (s.reasonLabel) { <p class="lead">Falta: {{ s.reasonLabel }}</p> }
                  <div class="grid">
                    @for (g of groups(); track g.group) {
                      <fieldset [class.pair]="g.fields.length > 1" [attr.data-testid]="'group-' + g.group">
                        <legend>{{ g.title }}</legend>
                        <div class="ctl">
                          @for (f of g.fields; track f.name) {
                            <div class="f"><label [attr.for]="id(f)">{{ f.label }}</label>
                              @if (f.kind === 'number') {
                                <input class="input" type="text" inputmode="decimal" autocomplete="off" [id]="id(f)" [attr.data-testid]="'field-' + f.name" [value]="values()[f.name] || ''" [disabled]="saving()" [attr.aria-invalid]="errors()[f.name] ? 'true' : null" [attr.aria-describedby]="describedBy(f)" (input)="changed.emit({ name: f.name, value: read($event) })" />
                              } @else {
                                <select class="input" [id]="id(f)" [attr.data-testid]="'field-' + f.name" [disabled]="saving()" [attr.aria-invalid]="errors()[f.name] ? 'true' : null" [attr.aria-describedby]="describedBy(f)" (change)="changed.emit({ name: f.name, value: read($event) })">
                                  <option value="" [selected]="!values()[f.name]">Elegir</option>
                                  @for (o of f.options ?? []; track o.value) { <option [value]="o.value" [selected]="o.value === values()[f.name]">{{ o.label }}</option> }
                                </select>
                              }
                              @if (hint(f); as h) { <small [id]="id(f) + '-hint'" [attr.title]="h">{{ h }}</small> }
                              @if (errors()[f.name]; as e) { <small class="bad" [id]="id(f) + '-err'" data-testid="field-error">{{ e }}</small> }
                            </div>
                          }
                        </div>
                      </fieldset>
                    }
                  </div>
                  @if (notice(); as n) { <p class="notice" role="status" data-testid="completion-notice">{{ n }}</p> }
                  @if (error(); as e) { <p class="alert alert-danger" role="alert" data-testid="completion-error">{{ e.message }}</p> }
                  <div class="acts">
                    <button type="submit" class="btn btn-primary" [disabled]="!canSave()" [attr.aria-busy]="saving()" data-testid="completion-save">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
                    @if (canNext()) { <button type="button" class="btn btn-secondary" [disabled]="!canSave()" data-testid="completion-save-next" (click)="saveNext.emit()">Guardar y siguiente</button> }
                    <button type="button" class="btn btn-secondary" [disabled]="saving()" data-testid="completion-cancel" (click)="dismissed.emit()">Cancelar</button>
                  </div>
                </form>
              }
            }
          }
          @default {
            <div class="skel" aria-hidden="true" data-testid="completion-loading"><i style="width: 70%"></i><i style="width: 90%"></i><i style="width: 60%"></i></div>
            <span class="sr-only" role="status">Cargando lo que falta del viaje…</span>
          }
        }
      }
    </section>
  `,
})
export class TripCompletionComponent {
  readonly mode = input.required<CompletionMode>();
  readonly state = input<CompletionState | null>(null);
  readonly status = input<ResourceStatus>('loading');
  readonly loadError = input<AppError | null>(null);
  readonly values = input<Readonly<Record<string, string>>>({});
  readonly errors = input<Readonly<Record<string, string>>>({});
  readonly saving = input(false);
  readonly error = input<AppError | null>(null);
  readonly notice = input<string | null>(null);
  readonly outcome = input<CompletionOutcome | null>(null);
  readonly hasValues = input(false);
  /** Hay otro viaje por completar en la página cargada. */
  readonly canNext = input(false);

  readonly changed = output<{ readonly name: string; readonly value: string }>();
  readonly save = output<void>();
  readonly saveNext = output<void>();
  readonly dismissed = output<void>();
  readonly finished = output<void>();
  readonly next = output<void>();
  readonly continue = output<void>();
  readonly retry = output<void>();

  private readonly title = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  protected readonly groups = computed(() => groupFields(this.state()?.fields ?? []));
  protected readonly canSave = computed(() => this.hasValues() && !this.saving());
  protected readonly message = resultMessage;

  constructor() {
    // Al abrir el formulario el foco va al primer dato; al mostrar el resultado, a su título (el botón que se pulsó ya no existe).
    effect(() => {
      const ready = this.status() === 'ready' && this.state()?.completable;
      const mode = this.mode();
      const first = this.state()?.tripId;

      untracked(() => setTimeout(() => (mode === 'done' ? this.title().nativeElement : ready && first ? this.host.nativeElement.querySelector<HTMLElement>('input, select') : this.title().nativeElement)?.focus()));
    });
  }

  protected id(field: CompletionField): string {
    return `cf-${field.name.replace('.', '-')}`;
  }

  protected hint(field: CompletionField): string | null {
    return field.hint ?? rangeText(field);
  }

  protected describedBy(field: CompletionField): string | null {
    const ids = [this.hint(field) ? `${this.id(field)}-hint` : null, this.errors()[field.name] ? `${this.id(field)}-err` : null].filter((id): id is string => !!id);

    return ids.length ? ids.join(' ') : null;
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();

    if (this.canSave()) this.save.emit();
  }
}
