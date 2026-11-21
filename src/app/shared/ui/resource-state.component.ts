import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { AppError } from '../../core/errors/app-error';
import { ResourceStatus } from '../../core/org/scoped-resource';

type View = 'loading' | 'error' | 'empty' | 'ready';

/**
 * Presenta los estados de carga, error y vacío de un recurso
 * y proyecta el contenido solo cuando hay datos.
 */
@Component({
  selector: 'app-resource-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      .rs-content { min-height: 0; }
      .rs-content.grow { flex: 1 1 0; }
      /* Llena el alto disponible SIN recortar: nunca queda más bajo que su contenido (a diferencia de grow). */
      .rs-content.fill { flex: 1 1 auto; min-height: auto; }
      @media (prefers-reduced-motion: no-preference) { .rs-content { animation: rs-in 0.35s ease-out both; } }
      @keyframes rs-in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
      .sk-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
      .sk-kpis .skeleton { height: 116px; border-radius: 14px; }
      .sk-chart { flex: 1 1 auto; min-height: 220px; border-radius: 14px; }
      .empty-ico { display: inline-grid; place-items: center; width: 52px; height: 52px; margin-bottom: 12px; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); }
      .empty-ico svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    @switch (view()) {
      @case ('loading') {
        @switch (skeleton()) {
          @case ('kpis') {
            <div class="sk-kpis" role="status" aria-busy="true" aria-live="polite">
              <span class="sr-only">Cargando…</span>
              @for (n of [1, 2, 3, 4, 5, 6]; track n) { <span class="skeleton"></span> }
            </div>
          }
          @case ('chart') {
            <span class="skeleton sk-chart rs-loading" role="status" aria-busy="true" aria-live="polite"><span class="sr-only">Cargando…</span></span>
          }
          @default {
            <div class="stack" role="status" aria-busy="true" aria-live="polite">
              <span class="sr-only">Cargando…</span>
              <span class="skeleton" style="height: 28px; width: 40%"></span>
              <span class="skeleton" style="height: 110px"></span>
              <span class="skeleton" style="height: 110px"></span>
            </div>
          }
        }
      }
      @case ('error') {
        <div class="alert alert-danger" role="alert">
          <div class="stack" style="gap: 4px; flex: 1">
            <strong>{{ error()?.message }}</strong>
            @if (error()?.requestId; as id) {
              <span class="small">Identificador de solicitud: <code>{{ id }}</code></span>
            }
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="retry.emit()">Reintentar</button>
        </div>
      }
      @case ('empty') {
        <div class="card" style="text-align: center; padding: 40px 20px">
          @if (emptyIcon(); as icon) { <span class="empty-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon" /></svg></span> }
          <h2>{{ emptyTitle() }}</h2>
          <p class="muted" style="margin-top: 6px">{{ emptyMessage() }}</p>
        </div>
      }
      @default {
        <div class="stack rs-content" [class.grow]="grow()" [class.fill]="fill()" style="gap: 16px"><ng-content /></div>
      }
    }
  `,
})
export class ResourceStateComponent {
  readonly status = input.required<ResourceStatus>();
  readonly error = input<AppError | null>(null);
  readonly empty = input(false);
  /** Dentro de una tarjeta con alto fijo: el contenido ocupa el espacio restante (p. ej. un gráfico). */
  readonly grow = input(false);
  readonly fill = input(false);
  /** Forma del esqueleto de carga: se parece al contenido final para que no haya saltos de diseño. */
  readonly skeleton = input<'default' | 'kpis' | 'chart'>('default');
  readonly emptyTitle = input('Sin resultados');
  readonly emptyMessage = input('No hay información para mostrar con los criterios actuales.');
  /** Trazo SVG (viewBox 24) opcional para ilustrar el estado vacío. */
  readonly emptyIcon = input<string | null>(null);
  readonly retry = output();

  protected readonly view = computed<View>(() => {
    const status = this.status();
    if (status === 'idle' || status === 'loading') return 'loading';
    if (status === 'error') return 'error';
    return this.empty() ? 'empty' : 'ready';
  });
}
