import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { SharedCandidate, SharedDecision } from '../../domain/models/reconciliation';
import {
  REASON,
  STATUS_VIEWS,
  STRENGTH_LABEL,
  SelectionChoice,
  bilateralStatus,
  canSelect,
  conflictLabels,
  evidenceLabels,
  isAmbiguous,
  isDecidable,
  AMBIGUOUS_NOTE,
  SUPERSEDED_NOTE,
  comparisonLine,
  ruleSentence,
  selectionStatus,
  sharedFields,
} from './shared-operations.view';
import { tripDateText } from './duplicates.view';

/**
 * Un posible viaje compartido con una empresa vinculada: la declaración propia completa de un lado y, del otro, solo lo que el servidor deja
 * ver (con la placa enmascarada); sin autorización de ambas empresas no aparece ningún valor ajeno, solo qué campos coinciden. Las acciones
 * son solo del lado propio. Lo que difiere se destaca con «≠» y texto para lectores de pantalla, no solo con color.
 */
@Component({
  selector: 'app-shared-candidate',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .cand { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: var(--shadow); }
      .cand.selected { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary); }
      .top { display: flex; align-items: center; gap: 8px 12px; flex-wrap: wrap; }
      .pick { display: inline-grid; place-items: center; width: 28px; height: 28px; flex: none; cursor: pointer; }
      .pick input { width: 18px; height: 18px; margin: 0; accent-color: var(--c-primary); cursor: pointer; }
      .pick input:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .kind { margin: 0; font-size: 1rem; font-weight: 800; color: var(--c-head); }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-size: 0.78rem; font-weight: 800; color: var(--c-head); background: var(--c-s3); }
      .chip i { font-style: normal; display: inline-grid; place-items: center; width: 16px; height: 16px; border-radius: 50%; background: var(--c-sf); font-size: 0.72rem; }
      .chip.t-possible { background: var(--c-info-bg); color: var(--c-info); }
      .chip.t-confirmed { background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-secondary) 40%, var(--c-sf)); }
      .chip.t-conflict { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); }
      .strength { margin-left: auto; color: var(--c-mu); font-size: 0.78rem; font-weight: 700; }
      .reason { margin: 0; color: var(--c-head); font-weight: 600; font-size: 0.92rem; }
      .why { margin: 0; color: var(--c-text2); font-size: 0.9rem; line-height: 1.4; }
      .sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .side { min-width: 0; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .side h4 { display: flex; align-items: baseline; flex-wrap: wrap; gap: 4px 8px; margin: 0 0 8px; font-size: 0.95rem; color: var(--c-head); overflow-wrap: anywhere; }
      .side h4 small { color: var(--c-mu); font-size: 0.78rem; font-weight: 600; }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px; margin: 0; }
      .f { min-width: 0; padding: 4px 8px; border-radius: 8px; }
      .f.w2 { grid-column: span 2; }
      .f dt { margin: 0; color: var(--c-mu); font-size: 0.72rem; font-weight: 700; }
      .f dd { margin: 0; color: var(--c-head); font-size: 0.9rem; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
      .f.diff { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); box-shadow: inset 3px 0 0 var(--c-primary); }
      .f.diff dd { font-weight: 800; }
      .neq { margin-right: 4px; color: var(--c-accent); font-style: normal; font-weight: 800; }
      .hidden { margin: 0 0 8px; color: var(--c-text2); font-size: 0.9rem; line-height: 1.4; }
      .tags { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 0 0 6px; font-size: 0.84rem; color: var(--c-text2); }
      .tag { padding: 1px 8px; border-radius: 999px; background: var(--c-s3); color: var(--c-head); font-weight: 700; font-size: 0.78rem; }
      .tag.diff { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); }
      .note { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--c-s2); color: var(--c-text2); font-size: 0.88rem; line-height: 1.4; }
      .bilateral { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 16px; margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--c-s2); font-size: 0.88rem; color: var(--c-head); font-weight: 600; }
      .bilateral small { flex-basis: 100%; color: var(--c-accent); font-size: 0.84rem; font-weight: 700; }
      .conflict { display: grid; gap: 8px; padding: 10px 12px; border-radius: 12px; border: 1px solid color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); }
      .conflict p { margin: 0; font-size: 0.9rem; color: var(--c-head); line-height: 1.4; }
      .conflict .muted { color: var(--c-text2); font-size: 0.86rem; }
      .actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
      @media (max-width: 900px) { .sides { grid-template-columns: minmax(0, 1fr); } }
    `,
  ],
  template: `
    <article class="cand" [class.selected]="selected()" [attr.aria-label]="'Posible viaje compartido del ' + date() + ' con ' + item().counterpartName" data-testid="shared-candidate">
      <header class="top">
        @if (decidable()) {
          <label class="pick">
            <input type="checkbox" data-testid="cand-select" [checked]="selected()" [disabled]="busy() || (!selected() && selectionFull())" [attr.aria-label]="'Seleccionar el viaje del ' + date() + ' con ' + item().counterpartName" (change)="toggled.emit()" />
          </label>
        }
        <h3 class="kind">Posible viaje compartido</h3>
        <span class="chip" [class]="'t-' + status().tone" data-testid="cand-state"><i aria-hidden="true">{{ status().glyph }}</i>{{ status().label }}</span>
        <span class="strength" data-testid="cand-strength">{{ strength() }}</span>
      </header>
      <p class="reason" data-testid="cand-reason">{{ reason }}</p>
      <p class="why" data-testid="cand-why">{{ why() }}</p>

      <div class="sides">
        <section class="side" aria-label="Tu declaración" data-testid="side-own">
          <h4>Tu empresa <small>Tu declaración, completa</small></h4>
          <dl class="grid">
            @for (field of fields(); track field.key) {
              <div class="f" [class.diff]="field.differs" [class.w2]="field.key === 'route'" [attr.data-field]="field.key">
                <dt>{{ field.label }}</dt>
                <dd>@if (field.differs) { <i class="neq" aria-hidden="true">≠</i> }{{ field.own }}@if (field.differs) { <span class="sr-only"> (difiere de la otra empresa)</span> }</dd>
              </div>
            }
          </dl>
        </section>

        <section class="side" [attr.aria-label]="'Declaración de ' + item().counterpartName" data-testid="side-other">
          <h4>{{ item().counterpartName }} <small>{{ item().counterpart ? 'Lo que dejó ver' : 'Valores no compartidos' }}</small></h4>
          @if (item().counterpart) {
            <dl class="grid">
              @for (field of fields(); track field.key) {
                <div class="f" [class.diff]="field.differs" [class.w2]="field.key === 'route'" [attr.data-field]="field.key">
                  <dt>{{ field.label }}</dt>
                  <dd>@if (field.differs) { <i class="neq" aria-hidden="true">≠</i> }{{ field.other ?? 'No se comparte' }}@if (field.differs) { <span class="sr-only"> (difiere de tu declaración)</span> }</dd>
                </div>
              }
            </dl>
          } @else {
            <p class="hidden" data-testid="cand-hidden">No se muestran los valores de esta empresa: hace falta que ambas empresas permitan compartir los resultados. Solo se sabe qué campos coinciden y cuáles difieren.</p>
            @if (matches().length > 0) {
              <p class="tags" data-testid="cand-matches">Coinciden: @for (name of matches(); track name) { <span class="tag">{{ name }}</span> }</p>
            }
            @if (differs().length > 0) {
              <p class="tags" data-testid="cand-differs">Difieren: @for (name of differs(); track name) { <span class="tag diff"><i class="neq" aria-hidden="true">≠</i>{{ name }}</span> }</p>
            }
          }
        </section>
      </div>

      @if (ambiguous()) { <p class="note" data-testid="cand-ambiguous">{{ ambiguousNote }}</p> }
      @if (item().superseded) { <p class="note" data-testid="cand-superseded">{{ supersededNote }}</p> }
      @if (comparison(); as line) { <p class="note" data-testid="cand-comparison">{{ line }}</p> }

      <p class="bilateral" role="group" aria-label="Estado de las decisiones" data-testid="cand-bilateral">
        <span data-testid="cand-mine">{{ bilateral().mine }}</span>
        <span data-testid="cand-other">{{ bilateral().other }}</span>
        @if (bilateral().note; as note) { <small data-testid="cand-note">{{ note }}</small> }
      </p>

      @if (item().status === 'CONFLICTING_DATA') {
        <section class="conflict" aria-label="Cifras en conflicto" data-testid="cand-conflict">
          <p><strong>Las dos empresas confirmaron que es el mismo viaje, pero declararon cifras distintas</strong>@if (conflicts().length > 0) { en: {{ conflicts().join(', ') }} }.</p>
          @if (selection(); as sel) {
            <p data-testid="sel-mine">{{ sel.mine }}</p>
            <p data-testid="sel-other">{{ sel.other }}</p>
            <p class="muted" data-testid="sel-summary">{{ sel.summary }}</p>
          }
          @if (canSelect()) {
            <div class="actions" role="group" aria-label="Elegir la declaración vigente">
              <button type="button" class="btn btn-secondary" data-testid="select-mine" [disabled]="busy()" (click)="choose.emit('MINE')">Usar mi declaración</button>
              <button type="button" class="btn btn-secondary" data-testid="select-theirs" [disabled]="busy()" (click)="choose.emit('THEIRS')">Usar la de la otra empresa</button>
            </div>
          } @else if (item().operation) {
            <p class="muted" data-testid="select-blocked">Para elegir hace falta que ambas empresas permitan compartir los resultados, así se pueden comparar los valores.</p>
          }
        </section>
      }

      @if (decidable()) {
        <div class="actions" role="group" aria-label="Decidir sobre este posible viaje compartido">
          <button type="button" class="btn btn-primary" data-testid="action-same" [disabled]="busy() || item().myDecision === 'SAME'" (click)="decide.emit('SAME')">Confirmar que es el mismo viaje</button>
          <button type="button" class="btn btn-secondary" data-testid="action-distinct" [disabled]="busy() || item().myDecision === 'DISTINCT'" (click)="decide.emit('DISTINCT')">Confirmar que son viajes distintos</button>
          <button type="button" class="btn btn-secondary" data-testid="action-needs-info" [disabled]="busy() || item().myDecision === 'NEEDS_INFO'" (click)="decide.emit('NEEDS_INFO')">Solicitar aclaración</button>
          <button type="button" class="btn btn-ghost" data-testid="action-pending" [disabled]="busy() || item().myDecision === 'KEEP_PENDING'" (click)="decide.emit('KEEP_PENDING')">Dejar pendiente</button>
        </div>
      }
    </article>
  `,
})
export class SharedCandidateComponent {
  readonly item = input.required<SharedCandidate>();
  readonly selected = input(false);
  /** Ya hay 500 marcados: no se pueden marcar más. */
  readonly selectionFull = input(false);
  readonly busy = input(false);
  readonly toggled = output();
  readonly decide = output<SharedDecision>();
  readonly choose = output<SelectionChoice>();

  protected readonly reason = REASON;
  protected readonly ambiguousNote = AMBIGUOUS_NOTE;
  protected readonly supersededNote = SUPERSEDED_NOTE;
  protected readonly fields = computed(() => sharedFields(this.item()));
  protected readonly status = computed(() => STATUS_VIEWS[this.item().status]);
  protected readonly strength = computed(() => STRENGTH_LABEL[this.item().strength]);
  protected readonly why = computed(() => ruleSentence(this.item()));
  protected readonly bilateral = computed(() => bilateralStatus(this.item()));
  protected readonly ambiguous = computed(() => isAmbiguous(this.item()));
  protected readonly comparison = computed(() => comparisonLine(this.item()));
  protected readonly decidable = computed(() => isDecidable(this.item()));
  protected readonly canSelect = computed(() => canSelect(this.item()));
  protected readonly selection = computed(() => selectionStatus(this.item()));
  protected readonly conflicts = computed(() => conflictLabels(this.item().conflictFields));
  protected readonly matches = computed(() => evidenceLabels(this.item().matches));
  protected readonly differs = computed(() => evidenceLabels(this.item().differs));
  protected readonly date = computed(() => (this.item().own.tripDate ? tripDateText(this.item().own.tripDate!) : 'viaje sin fecha'));
}
