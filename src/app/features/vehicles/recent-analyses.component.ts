import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, output } from '@angular/core';
import { AnalysisSummary } from '../../domain/models/vehicles';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { AnalysisFacade } from './analysis.facade';
import { ANALYSIS_STATUS_LABELS } from './analysis.labels';

/** «Cargas recientes»: las últimas corridas, con su estado, sus conteos y lo que sigue pendiente. */
@Component({
  selector: 'app-recent-analyses',
  imports: [DatePipe, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      section { border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); padding: 14px 20px; box-shadow: var(--shadow); }
      h2 { margin: 0 0 8px; font-size: 1rem; color: var(--c-head); }
      ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; }
      li { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; padding: 8px 0; border-top: 1px solid var(--c-bd); }
      li:first-child { border-top: 0; }
      .name { flex: 1 1 200px; min-width: 0; }
      .name strong { display: block; color: var(--c-head); overflow-wrap: anywhere; }
      .name small { color: var(--c-mu); }
      .counts { color: var(--c-text2); font-size: 0.84rem; }
      .pend { display: inline-flex; gap: 6px; }
      .pill { padding: 1px 8px; border-radius: 999px; font-size: 0.74rem; font-weight: 800; background: var(--c-warn-soft); color: var(--c-warning); }
      .pill.bad { background: var(--c-bad-soft); color: var(--c-danger); }
      @media (max-width: 768px) { li { align-items: flex-start; } }
    `,
  ],
  template: `
    @if (facade.recent.data(); as page) {
      @if (page.items.length > 0) {
        <section aria-labelledby="recent-title" data-testid="recent-analyses">
          <h2 id="recent-title">Cargas recientes</h2>
          <ul>
            @for (a of page.items; track a.id) {
              <li data-testid="recent-item">
                <span class="name"><strong>{{ a.fileName }}</strong><small>{{ a.createdAt | date: 'd MMM y, HH:mm' }}</small></span>
                <app-status-badge [label]="statusLabels[a.status]" />
                <span class="counts">{{ a.counts.detected }} detectados · {{ a.counts.new }} nuevos · {{ a.counts.conflict }} con conflictos</span>
                <span class="pend" aria-label="Pendiente por decidir">
                  @if (a.pending.new > 0) { <span class="pill" data-testid="pending-new">{{ a.pending.new }} nuevos</span> }
                  @if (a.pending.conflict > 0) { <span class="pill bad" data-testid="pending-conflict">{{ a.pending.conflict }} con conflictos</span> }
                </span>
                <button type="button" class="btn btn-secondary btn-sm" data-testid="open-analysis" [attr.aria-label]="'Abrir el análisis de ' + a.fileName" (click)="open.emit(a)">Abrir</button>
              </li>
            }
          </ul>
        </section>
      }
    }
  `,
})
export class RecentAnalysesComponent {
  protected readonly facade = inject(AnalysisFacade);
  protected readonly statusLabels = ANALYSIS_STATUS_LABELS;

  readonly open = output<AnalysisSummary>();
}
