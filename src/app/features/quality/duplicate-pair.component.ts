import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DuplicateDecision, PossibleDuplicate } from '../../domain/models/duplicates';
import { comparisonFields, differingLabels, groupLine, idMismatchLine, lineageLine, ruleSentence, tripDateText } from './duplicates.view';

/**
 * Un posible duplicado: el viaje retenido (A, no suma por ahora) y el vigente (B, suma) lado a lado con solo lo necesario para decidir, lo que difiere
 * destacado (con marca «≠» y texto para lectores de pantalla, no solo con color) y las tres decisiones.
 */
@Component({
  selector: 'app-duplicate-pair',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .pair { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: var(--shadow); }
      .pair.selected { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary); }
      .top { display: flex; align-items: center; gap: 10px 12px; flex-wrap: wrap; }
      .pick { display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; cursor: pointer; }
      .pick input { width: 18px; height: 18px; margin: 0; accent-color: var(--c-primary); cursor: pointer; }
      .pick input:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .rule { flex: none; padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-secondary) 40%, var(--c-sf)); color: var(--c-head); font-size: 0.76rem; font-weight: 800; }
      .why { flex: 1 1 260px; margin: 0; color: var(--c-text2); font-size: 0.9rem; line-height: 1.4; }
      .facts { display: grid; gap: 2px; margin: -4px 0 0 38px; color: var(--c-text2); font-size: 0.84rem; line-height: 1.4; }
      .facts p { margin: 0; }
      .sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .side { min-width: 0; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .side h4 { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin: 0 0 8px; font-size: 0.95rem; color: var(--c-head); }
      .side h4 small { color: var(--c-mu); font-size: 0.78rem; font-weight: 600; }
      .side .file { margin: -4px 0 8px; color: var(--c-text2); font-size: 0.82rem; overflow-wrap: anywhere; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; margin: 0; }
      .f { min-width: 0; padding: 4px 8px; border-radius: 8px; }
      .f.w2 { grid-column: span 2; }
      .f.w3 { grid-column: 1 / -1; }
      .f dt { margin: 0; color: var(--c-mu); font-size: 0.72rem; font-weight: 700; }
      .f dd { margin: 0; color: var(--c-head); font-size: 0.9rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .f.diff { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); box-shadow: inset 3px 0 0 var(--c-primary); }
      .f.diff dd { font-weight: 800; }
      .neq { margin-right: 4px; color: var(--c-accent); font-style: normal; font-weight: 800; }
      .gone { margin: 0; padding: 8px; color: var(--c-text2); font-size: 0.9rem; }
      .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
      @media (max-width: 900px) { .sides { grid-template-columns: minmax(0, 1fr); } }
    `,
  ],
  template: `
    <article class="pair" [class.selected]="selected()" [attr.aria-label]="'Posible duplicado de la placa ' + item().a.plate + ' del ' + date()" data-testid="duplicate-pair">
      <header class="top">
        <label class="pick">
          <input type="checkbox" data-testid="pair-select" [checked]="selected()" [disabled]="busy() || (!selected() && selectionFull())" [attr.aria-label]="'Seleccionar el par de la placa ' + item().a.plate + ' del ' + date()" (change)="toggled.emit()" />
        </label>
        <span class="rule" data-testid="pair-rule">{{ item().ruleLabel }}</span>
        <p class="why" data-testid="pair-why">{{ why() }}</p>
      </header>

      @if (idMismatch() || lineage() || group()) {
        <div class="facts" data-testid="pair-facts">
          @if (idMismatch(); as line) { <p data-testid="pair-id-mismatch">{{ line }}</p> }
          @if (lineage(); as line) { <p data-testid="pair-lineage">{{ line }}</p> }
          @if (group(); as line) { <p data-testid="pair-group">{{ line }}</p> }
        </div>
      }

      <div class="sides">
        <section class="side" [attr.aria-label]="'Viaje A, retenido'" data-testid="side-a">
          <h4>Viaje A <small>Retenido (no suma por ahora)</small></h4>
          <p class="file" data-testid="side-a-file">{{ item().a.fileName }}</p>
          <dl class="grid">
            @for (field of fields(); track field.key) {
              <div class="f" [class.diff]="field.differs" [class.w2]="field.key === 'route'" [class.w3]="field.key === 'file'" [attr.data-field]="field.key">
                <dt>{{ field.label }}</dt>
                <dd>@if (field.differs) { <i class="neq" aria-hidden="true">≠</i> }{{ field.a }}@if (field.differs) { <span class="sr-only"> (es distinto en el otro viaje)</span> }</dd>
              </div>
            }
          </dl>
        </section>
        <section class="side" [attr.aria-label]="'Viaje B, vigente'" data-testid="side-b">
          <h4>Viaje B <small>Vigente (suma)</small></h4>
          @if (item().b; as current) {
            <p class="file" data-testid="side-b-file">{{ current.fileName }}</p>
            <dl class="grid">
              @for (field of fields(); track field.key) {
                <div class="f" [class.diff]="field.differs" [class.w2]="field.key === 'route'" [class.w3]="field.key === 'file'" [attr.data-field]="field.key">
                  <dt>{{ field.label }}</dt>
                  <dd>@if (field.differs) { <i class="neq" aria-hidden="true">≠</i> }{{ field.b }}@if (field.differs) { <span class="sr-only"> (es distinto en el otro viaje)</span> }</dd>
                </div>
              }
            </dl>
          } @else {
            <p class="gone" data-testid="side-b-gone">El viaje vigente ya no está disponible para compararlo.</p>
          }
        </section>
      </div>

      @if (differing().length > 0) { <p class="sr-only" data-testid="pair-differences">Difieren: {{ differing().join(', ') }}.</p> }

      <div class="actions" role="group" aria-label="Decidir sobre este posible duplicado">
        <button type="button" class="btn btn-primary" data-testid="action-same" [disabled]="busy() || !item().b" [attr.title]="item().b ? null : 'No se puede decir que es el mismo viaje porque el viaje vigente ya no está disponible'" (click)="decide.emit('SAME_TRIP')">Son el mismo viaje</button>
        <button type="button" class="btn btn-secondary" data-testid="action-different" [disabled]="busy()" (click)="decide.emit('DIFFERENT_TRIPS')">Son viajes diferentes</button>
        <button type="button" class="btn btn-ghost" data-testid="action-pending" [disabled]="busy()" (click)="decide.emit('KEEP_PENDING')">Dejar pendiente</button>
      </div>
    </article>
  `,
})
export class DuplicatePairComponent {
  readonly item = input.required<PossibleDuplicate>();
  readonly selected = input(false);
  /** Ya hay 500 marcados: no se pueden marcar más. */
  readonly selectionFull = input(false);
  readonly busy = input(false);
  readonly toggled = output();
  readonly decide = output<DuplicateDecision>();

  protected readonly fields = computed(() => comparisonFields(this.item()));
  protected readonly differing = computed(() => differingLabels(this.fields()));
  protected readonly why = computed(() => ruleSentence(this.item()));
  protected readonly idMismatch = computed(() => idMismatchLine(this.item().evidence));
  protected readonly lineage = computed(() => lineageLine(this.item().evidence));
  protected readonly group = computed(() => groupLine(this.item().evidence));
  protected readonly date = computed(() => tripDateText(this.item().a.tripDate));
}
