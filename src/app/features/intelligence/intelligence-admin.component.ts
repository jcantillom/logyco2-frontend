import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Observable, concat, toArray } from 'rxjs';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ToastService } from '../../core/notifications/toast.service';
import { IngestionResult, SourceStatus } from '../../domain/models/intelligence';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { IntelligenceFacade } from './intelligence.facade';
import { errorLabel } from './intelligence.labels';

/**
 * Administración de las fuentes de LoGyCO₂ Intelligence (solo administradores de la plataforma, bajo `/plataforma`):
 * estado de cada fuente y actualización a demanda. El tablero de consulta no ejecuta procesos técnicos.
 */
@Component({
  selector: 'app-intelligence-admin',
  imports: [DatePipe, RouterLink, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .back { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 600; color: var(--c-accent); text-decoration: none; }
      .back svg { width: 16px; height: 16px; }
      .back:hover { text-decoration: underline; }
      .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
      .top h1 { margin: 4px 0 0; }
      .top p { margin: 4px 0 0; color: var(--c-mu); max-width: 640px; }
      .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }
      .src { display: flex; flex-direction: column; gap: 10px; padding: 18px; border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .src header { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; }
      .src h2 { margin: 0; font-size: 1rem; }
      .src header p { margin: 2px 0 0; font-size: 0.78rem; color: var(--c-mu); }
      .pill { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 0.7rem; font-weight: 800; background: var(--c-s3); color: var(--c-mute2); white-space: nowrap; }
      .pill.ok { background: var(--c-ok-soft); color: var(--c-accent); }
      .pill.err { background: var(--c-bad-soft); color: var(--c-bad); }
      dl { display: grid; grid-template-columns: auto 1fr; gap: 5px 14px; margin: 0; font-size: 0.8rem; }
      dt { color: var(--c-mu); }
      dd { margin: 0; color: var(--c-head); font-weight: 600; min-width: 0; overflow-wrap: anywhere; }
      .note { margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--c-s2); font-size: 0.76rem; color: var(--c-mu); line-height: 1.45; }
      .error { margin: 0; padding: 8px 10px; border-radius: 10px; background: var(--c-bad-soft); color: var(--c-bad); font-size: 0.78rem; }
      .actions { display: flex; align-items: center; gap: 10px; margin-top: auto; }
      .actions .btn { display: inline-flex; align-items: center; gap: 8px; }
      .actions svg { width: 16px; height: 16px; }
      .busy svg { animation: spin 0.9s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .busy svg { animation: none; } }
    `,
  ],
  template: `
    <div class="page">
      <a class="back" routerLink="/plataforma/intelligence" data-testid="back"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 6l-6 6 6 6" /></svg>Volver a LoGyCO₂ Intelligence</a>
      <header class="top">
        <div>
          <h1>Administración de fuentes</h1>
          <p>Estado de cada fuente oficial y actualización a demanda. Si una actualización falla, se conservan los últimos datos válidos y su fecha.</p>
        </div>
        <button type="button" class="btn btn-primary" [disabled]="busy() !== null || automatic().length === 0" (click)="refreshAll()" data-testid="refresh-all">
          Actualizar todas las automáticas
        </button>
      </header>

      <app-resource-state [status]="facade.sources.status()" [error]="facade.sources.error()" (retry)="facade.loadAll()">
        <div class="grid" data-testid="admin-sources">
          @for (s of facade.sources.data() ?? []; track s.code) {
            <article class="src" [attr.data-source]="s.code">
              <header>
                <div><h2>{{ s.name }}</h2><p><a [href]="s.url" target="_blank" rel="noopener noreferrer">{{ s.publisher }}</a> · {{ s.frequency }}</p></div>
                <span class="pill" [class.ok]="state(s) === 'ok'" [class.err]="state(s) === 'err'" data-testid="status">{{ label(s) }}</span>
              </header>
              <dl>
                <dt>Último éxito</dt><dd>{{ s.lastSuccessAt ? (s.lastSuccessAt | date: 'medium') : 'Sin datos aún' }}</dd>
                <dt>Último intento</dt><dd>{{ s.lastAttemptAt ? (s.lastAttemptAt | date: 'medium') : '—' }}</dd>
                <dt>Licencia</dt><dd>{{ s.license ?? 'Por confirmar' }}</dd>
              </dl>
              @if (s.lastErrorCode) { <p class="error" role="status">La última actualización falló: {{ errorLabel(s.lastErrorCode) }}. Se conservan los últimos datos válidos.</p> }
              @if (s.notes) { <p class="note">{{ s.notes }}</p> }
              <div class="actions">
                @if (s.providerAvailable) {
                  <button type="button" class="btn btn-secondary" [class.busy]="busy() === s.code" [disabled]="busy() !== null" (click)="refresh(s.code)" data-testid="refresh">
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>{{ busy() === s.code ? 'Actualizando…' : 'Actualizar ahora' }}
                  </button>
                } @else {
                  <span class="muted small">Sin proveedor automático: no hay una publicación oficial legible por máquina.</span>
                }
              </div>
            </article>
          }
        </div>
      </app-resource-state>
    </div>
  `,
})
export class IntelligenceAdminComponent {
  protected readonly facade = inject(IntelligenceFacade);
  private readonly toast = inject(ToastService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  /** Código de la fuente que se está actualizando (`'*'` = todas). */
  protected readonly busy = signal<string | null>(null);
  protected readonly automatic = computed(() => (this.facade.sources.data() ?? []).filter((s) => s.providerAvailable));
  protected readonly errorLabel = errorLabel;

  constructor() {
    this.facade.loadAll();
  }

  protected state(source: SourceStatus): 'ok' | 'err' | 'none' {
    return source.lastErrorCode ? 'err' : source.lastSuccessAt ? 'ok' : 'none';
  }
  protected label(source: SourceStatus): string {
    if (!source.providerAvailable) return 'Pendiente';

    return source.lastErrorCode ? 'Con error' : source.lastSuccessAt ? 'Actualizado' : 'Sin datos';
  }

  protected refresh(code: string): void {
    this.run(code, this.facade.refresh(code));
  }
  protected refreshAll(): void {
    this.run('*', concat(...this.automatic().map((s) => this.facade.refresh(s.code))));
  }

  private run(code: string, source$: Observable<IngestionResult>): void {
    this.busy.set(code);
    this.feedback.start('Actualizando datos…');
    source$.pipe(toArray(), takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (results) => {
        this.busy.set(null);
        this.feedback.close();
        this.report(results);
      },
      error: (error: unknown) => {
        this.busy.set(null);
        this.feedback.close();
        this.toast.error(toAppError(error));
      },
    });
  }

  private report(results: readonly IngestionResult[]): void {
    const failed = results.filter((r) => r.status === 'FAILED');

    if (failed.length > 0) {
      this.toast.warning(`No se pudo actualizar: ${failed.map((r) => errorLabel(r.errorCode ?? '')).join('; ')}. Se conservan los últimos datos válidos.`);
      return;
    }

    const total = (key: 'inserted' | 'revised' | 'unchanged'): number => results.reduce((sum, r) => sum + r[key], 0);
    this.feedback.finish(`Actualización completa: ${total('inserted')} nuevos, ${total('revised')} revisados, ${total('unchanged')} sin cambios`);
  }
}
