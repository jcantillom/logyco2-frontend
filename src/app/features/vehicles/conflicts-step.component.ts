import { ChangeDetectionStrategy, Component, WritableSignal, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { toAppError } from '../../core/errors/http-error-mapper';
import { Finding, ResolveAction } from '../../domain/models/vehicles';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { AnalysisFacade } from './analysis.facade';
import { DECISION_LABELS, OVERFLOW_NOTE, SEVERITY_LABELS, conflictSentence, hasIncomingValue, needsStructuralConfirmation, unreadableNote } from './analysis.labels';
import { ANALYSIS_STYLES } from './analysis.styles';
import { changeValue, fieldLabel } from './vehicles.labels';

/** Paso 4: placas ya registradas cuyo dato del archivo es distinto, y (más discretos) los registros incompletos e inválidos. */
@Component({
  selector: 'app-conflicts-step',
  imports: [PaginationComponent, ResourceStateComponent, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [ANALYSIS_STYLES],
  template: `
    @if (!canManage()) {
      <p class="note" data-testid="read-only">Solo quien administra los vehículos puede decidir. Aquí puedes revisar las diferencias.</p>
    }
    <app-resource-state [status]="analysis.conflicts.status()" [error]="analysis.conflicts.error()" (retry)="analysis.loadState('CONFLICT')">
      @if (analysis.conflicts.data(); as data) {
        @if (data.total === 0) {
          <p class="empty" data-testid="conflicts-empty">El archivo no trae información distinta a la que ya tienes.</p>
        } @else {
          <div class="cards" data-testid="conflict-cards">
            @for (f of data.items; track f.id) {
              <article class="card-f" [class.done]="isDone(f)" data-testid="conflict-card" [attr.aria-labelledby]="'cf-' + f.id">
                <header>
                  <h3 [id]="'cf-' + f.id">{{ f.plate }}@if (f.plateOriginal !== f.plate) { <small> · como llegó: {{ f.plateOriginal }}</small> }</h3>
                  @if (decisionLabel(f); as label) { <app-status-badge [label]="label" /> }
                </header>
                <p data-testid="sentence">{{ sentence(f) }}</p>
                @if (f.inFileConflicts.length > 0) {
                  <ul class="vals" data-testid="in-file">
                    @for (c of f.inFileConflicts; track c.field) {
                      @for (v of c.values; track $index) {
                        <li>{{ fieldText(c.field) }}: <strong>{{ value(c.field, v.value) }}</strong> · {{ v.count }} {{ v.count === 1 ? 'vez' : 'veces' }} (filas {{ v.rows.join(', ') }})</li>
                      }
                      @if (c.overflow) { <li class="why" data-testid="overflow">{{ overflowNote }}</li> }
                    }
                  </ul>
                }
                @if (unreadable(f); as note) { <p class="why" data-testid="unreadable">{{ note }}</p> }
                @if (f.differences.length > 0) {
                  <div class="tw">
                    <table class="tbl" data-testid="differences">
                      <caption class="sr-only">Diferencias de {{ f.plate }}</caption>
                      <thead><tr><th scope="col">Campo</th><th scope="col">Dato actual</th><th scope="col">Dato recibido</th><th scope="col">Importancia</th><th scope="col">Qué hacer</th></tr></thead>
                      <tbody>
                        @for (d of f.differences; track d.field) {
                          <tr>
                            <th scope="row">{{ fieldText(d.field) }}</th>
                            <td data-l="Dato actual">{{ value(d.field, d.current) }}</td>
                            <td data-l="Dato recibido">{{ value(d.field, d.incoming) }}</td>
                            <td data-l="Importancia"><app-status-badge [label]="severity[d.severity]" /></td>
                            <td data-l="Qué hacer">{{ d.recommendedAction }}</td>
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>
                }
                @if (canManage() && !isDone(f)) {
                  @if (structural(f)) {
                    <label class="confirm"><input type="checkbox" data-testid="confirm-structural" [checked]="confirmed().has(f.id)" (change)="toggleConfirm(f.id)" /><span>Confirmo que quiero reemplazar la configuración o el tipo registrados por los del archivo.</span></label>
                  }
                  <div class="actions">
                    <button type="button" class="btn btn-secondary btn-sm" data-testid="keep-current" [disabled]="busy().has(f.id)" (click)="decide(f, 'KEEP_CURRENT')">Mantener información actual</button>
                    <button type="button" class="btn btn-primary btn-sm" data-testid="accept-incoming" [disabled]="busy().has(f.id) || !usable(f) || (structural(f) && !confirmed().has(f.id))" [attr.aria-describedby]="usable(f) ? null : 'why-' + f.id" (click)="decide(f, 'ACCEPT_INCOMING')">Usar la información del archivo</button>
                    <button type="button" class="btn btn-ghost btn-sm" data-testid="defer" [disabled]="busy().has(f.id)" (click)="decide(f, 'DEFER')">Dejar pendiente</button>
                  </div>
                  @if (!usable(f)) { <p class="why" [id]="'why-' + f.id" data-testid="why-disabled">El archivo no trae un valor definido para esta placa, así que no hay información del archivo para usar.</p> }
                }
                @if (errors()[f.id]; as message) {
                  <p class="err" role="alert" data-testid="resolve-error">{{ message }}</p>
                  @if (stale().has(f.id)) { <div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-testid="refresh-findings" (click)="refresh(f.id, data.page)">Actualizar</button></div> }
                }
              </article>
            }
          </div>
          <div class="foot"><app-pagination [page]="data" (pageChange)="analysis.loadState('CONFLICT', $event)" /></div>
        }
      }
    </app-resource-state>

    @if ((analysis.incomplete.data()?.total ?? 0) > 0) {
      <details class="light" data-testid="incomplete-section">
        <summary>Registros incompletos ({{ analysis.incomplete.data()?.total }})</summary>
        <div class="cards">
          @for (f of analysis.incomplete.data()?.items ?? []; track f.id) {
            <article class="card-f" data-testid="incomplete-card">
              <header><h3>{{ f.plate }}</h3>@if (decisionLabel(f); as label) { <app-status-badge [label]="label" /> }</header>
              <p>{{ completion(f) }}</p>
              @if (canManage() && !isDone(f) && usable(f)) {
                <div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-testid="complete" [disabled]="busy().has(f.id)" (click)="decide(f, 'ACCEPT_INCOMING')">Completar con el archivo</button></div>
              }
              @if (errors()[f.id]; as message) {
                <p class="err" role="alert">{{ message }}</p>
                @if (stale().has(f.id)) { <div class="actions"><button type="button" class="btn btn-secondary btn-sm" data-testid="refresh-findings" (click)="refresh(f.id, 1)">Actualizar</button></div> }
              }
            </article>
          }
        </div>
      </details>
    }
    @if ((analysis.invalid.data()?.total ?? 0) > 0) {
      <details class="light" data-testid="invalid-section">
        <summary>Placas inválidas ({{ analysis.invalid.data()?.total }})</summary>
        <div class="cards">
          @for (f of analysis.invalid.data()?.items ?? []; track f.id) {
            <article class="card-f" data-testid="invalid-card">
              <header><h3>{{ f.plateOriginal }}</h3></header>
              <p>{{ f.invalidReason ?? 'La placa no tiene un formato válido.' }}</p>
              @if (f.sampleRows.length > 0) { <p class="why">Filas del archivo: {{ f.sampleRows.join(', ') }}</p> }
            </article>
          }
        </div>
      </details>
    }
  `,
})
export class ConflictsStepComponent {
  protected readonly analysis = inject(AnalysisFacade);
  private readonly access = inject(AccessPolicy);

  protected readonly severity = SEVERITY_LABELS;
  protected readonly overflowNote = OVERFLOW_NOTE;
  protected readonly unreadable = unreadableNote;
  /** Hallazgos cuyo vehículo cambió después del análisis (`FINDING_STALE`): se ofrece actualizar la revisión. */
  protected readonly stale = signal<ReadonlySet<string>>(new Set());
  protected readonly canManage = computed(() => this.access.can('vehicles:manage'));
  protected readonly confirmed = signal<ReadonlySet<string>>(new Set());
  protected readonly busy = signal<ReadonlySet<string>>(new Set());
  protected readonly errors = signal<Readonly<Record<string, string>>>({});
  protected readonly sentence = conflictSentence;
  protected readonly structural = needsStructuralConfirmation;
  protected readonly usable = hasIncomingValue;
  protected readonly fieldText = fieldLabel;
  protected readonly value = changeValue;

  /** Lo que ya se decidió (distinto de «pendiente» y de «dejado para después») ya no ofrece acciones. */
  protected isDone(f: Finding): boolean {
    return f.decision === 'CONFIRMED' || f.decision === 'REJECTED';
  }

  protected decisionLabel(f: Finding) {
    return DECISION_LABELS[f.decision];
  }

  /** «Se completaría: Combustible Diésel · Modelo 2018» con lo que el archivo aporta y el vehículo no tiene. */
  protected completion(f: Finding): string {
    const parts = f.differences.filter((d) => d.incoming !== null && d.current === null).map((d) => `${fieldLabel(d.field)} ${changeValue(d.field, d.incoming)}`);

    return parts.length > 0 ? `Se completaría: ${parts.join(' · ')}.` : 'Al vehículo le faltan datos que el archivo no trae.';
  }

  /** Vuelve a pedir los hallazgos de la corrida: el servidor entrega el estado actual de cada vehículo. */
  protected refresh(id: string, page: number): void {
    this.mark(this.stale, id, false);
    this.errors.update((errors) => {
      const next = { ...errors };

      delete next[id];

      return next;
    });
    this.analysis.loadState('CONFLICT', page);
    this.analysis.loadState('INCOMPLETE');
  }

  protected toggleConfirm(id: string): void {
    this.confirmed.update((set) => {
      const next = new Set(set);

      if (!next.delete(id)) next.add(id);

      return next;
    });
  }

  protected decide(f: Finding, action: ResolveAction): void {
    const structural = action === 'ACCEPT_INCOMING' && needsStructuralConfirmation(f);

    this.mark(this.busy, f.id, true);
    this.errors.update((errors) => {
      const next = { ...errors };

      delete next[f.id];

      return next;
    });

    this.analysis.resolve(f, { action, confirmStructural: structural ? true : undefined }).subscribe({
      next: () => this.mark(this.busy, f.id, false),
      error: (e: unknown) => {
        const error = toAppError(e);

        this.mark(this.busy, f.id, false);
        this.errors.update((errors) => ({ ...errors, [f.id]: error.message }));
        if (error.code === 'FINDING_STALE') this.mark(this.stale, f.id, true);
      },
    });
  }

  private mark(target: WritableSignal<ReadonlySet<string>>, id: string, on: boolean): void {
    target.update((set) => {
      const next = new Set(set);

      if (on) next.add(id);
      else next.delete(id);

      return next;
    });
  }
}
