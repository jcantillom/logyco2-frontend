import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { CargoUnitSource, ImportReview } from '../../domain/models/imports';
import { formatPct, formatTonnes } from '../../shared/ui/footprint.format';
import { ImportCargoUnitFacade } from './import-cargo-unit.facade';
import { formatCount } from './imports.labels';

/** Quién respaldó la unidad que usa la carga; los textos son de la pantalla, la fuente es del servidor. */
const SOURCE_TEXT: Readonly<Record<CargoUnitSource, string>> = {
  HEADER: 'El archivo declara kilogramos: se convierten a toneladas automáticamente.',
  COMPANY_SETTING: 'Tu empresa convierte los kilogramos a toneladas cuando los detecta.',
  ADMIN: 'Una persona confirmó los kilogramos.',
};

/**
 * «Unidad de la carga» de la revisión: aparece solo cuando el servidor tiene algo que decir (propone kilogramos, ya los convirtió por el
 * encabezado, el ajuste de la empresa o una persona). Todas las cifras son del servidor; la pantalla solo envía la elección. El archivo y sus
 * valores originales nunca se modifican: solo cambia la carga derivada en toneladas.
 */
@Component({
  selector: 'app-import-cargo-unit',
  imports: [DatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      section { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      section.alert-box { border-color: color-mix(in srgb, var(--c-accent) 40%, var(--c-bd)); }
      h3 { margin: 0; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      p { margin: 0; font-size: 0.9rem; color: var(--c-text); }
      p.small { font-size: 0.82rem; color: var(--c-mu); }
      dl.ev { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 6px 14px; margin: 0; }
      dl.ev > div { display: flex; flex-direction: column; }
      dl.ev dt { color: var(--c-mu); font-size: 0.76rem; font-weight: 600; }
      dl.ev dd { margin: 0; font-size: 0.9rem; font-weight: 700; color: var(--c-head); }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .actions button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .done { color: var(--c-success); font-weight: 600; }
      .err { color: var(--c-danger); font-weight: 600; }
    `,
  ],
  template: `
    @if (visible()) {
      <section [class.alert-box]="canConfirm()" aria-labelledby="cu-title" data-testid="cargo-unit">
        <h3 id="cu-title">Unidad de la carga</h3>

        @if (applied(); as a) {
          <p data-testid="cargo-unit-applied">
            @if (a.unit === 'KG') {
              {{ sourceText[a.source] }}
              @if (a.source === 'HEADER' && a.header) { Encabezado: «{{ a.header }}». }
              @if (a.source !== 'HEADER') { Convertida el {{ a.confirmedAt | date: 'd MMM y, HH:mm' }}. }
            } @else {
              Esta carga se mantiene en toneladas, como la declara el archivo (elegido el {{ a.confirmedAt | date: 'd MMM y, HH:mm' }}).
            }
          </p>
          @if (a.unit === 'KG') { <p class="small" data-testid="cargo-unit-original">Los valores originales del archivo no se modifican: solo cambia la carga en toneladas de los viajes.</p> }
        }

        @if (proposal(); as p) {
          <p data-testid="cargo-unit-message">{{ p.message }}</p>
          <dl class="ev" data-testid="cargo-unit-evidence">
            <div><dt>Filas sobre {{ ton(p.evidence.limitTon) }} t</dt><dd>{{ count(p.evidence.rowsOverLimit) }} de {{ count(p.evidence.rowsWithCargo) }} ({{ pct(p.evidence.shareOverLimitPct) }} %)</dd></div>
            @if (p.evidence.medianValue !== null && p.evidence.medianAsTonsIfKg !== null) {
              <div><dt>Mediana{{ p.evidence.medianExact ? '' : ' (aproximada)' }}</dt><dd>{{ ton(p.evidence.medianValue) }} → {{ ton(p.evidence.medianAsTonsIfKg) }} t si son kg</dd></div>
            }
            @if (p.evidence.medianPctOfCapacity !== null && p.evidence.medianCapacityTon !== null) {
              <div><dt>Frente a la capacidad</dt><dd>{{ pct(p.evidence.medianPctOfCapacity) }} % de {{ ton(p.evidence.medianCapacityTon) }} t</dd></div>
            }
            <div><dt>Total si se convierte</dt><dd>{{ ton(p.evidence.totalTonIfKg) }} t en {{ count(p.evidence.rowsWithCargoIfKg) }} filas</dd></div>
            @if (p.evidence.rowsStillOutOfRangeIfKg > 0) { <div><dt>Seguirían fuera de rango</dt><dd>{{ count(p.evidence.rowsStillOutOfRangeIfKg) }} filas</dd></div> }
          </dl>

          @if (canAct() && applied()?.unit !== 'KG') {
            <div class="actions">
              @if (applied()?.unit !== 'KG') {
                <button type="button" class="btn btn-primary btn-sm" data-testid="cargo-unit-kg" [disabled]="facade.busy() !== null" [attr.aria-busy]="facade.busy() === 'KG'" (click)="facade.confirm(importId(), 'KG')">{{ facade.busy() === 'KG' ? 'Convirtiendo…' : 'Usar kilogramos y convertir a toneladas' }}</button>
              }
              @if (!applied()) {
                <button type="button" class="btn btn-secondary btn-sm" data-testid="cargo-unit-keep" [disabled]="facade.busy() !== null" [attr.aria-busy]="facade.busy() === 'TON'" (click)="facade.confirm(importId(), 'TON')">{{ facade.busy() === 'TON' ? 'Guardando…' : 'Mantener como está' }}</button>
              }
            </div>
          } @else if (p.status === 'KG_LIKELY' && !canConfirm()) {
            <p class="small" data-testid="cargo-unit-readonly">Quien tiene permiso para cargar información puede confirmar esta conversión.</p>
          }
        }

        <div aria-live="polite">
          @if (outcomeText(); as t) { <p class="done" role="status" data-testid="cargo-unit-result">{{ t }}</p> }
          @if (facade.error(); as e) { <p class="err" role="alert" data-testid="cargo-unit-error">{{ e.message }}</p> }
        </div>
      </section>
    }
  `,
})
export class ImportCargoUnitComponent {
  protected readonly facade = inject(ImportCargoUnitFacade);
  private readonly access = inject(AccessPolicy);

  readonly importId = input.required<string>();
  readonly review = input.required<ImportReview>();

  protected readonly sourceText = SOURCE_TEXT;
  protected readonly ton = formatTonnes;
  protected readonly pct = formatPct;
  protected readonly count = formatCount;

  protected readonly proposal = computed(() => this.review().cargoUnitProposal);
  protected readonly applied = computed(() => this.review().cargoUnitApplied);
  protected readonly canConfirm = computed(() => this.access.can('imports:create'));
  /** Solo lo que el servidor propone como confirmable (`KG_LIKELY`) ofrece acciones; lo ambiguo solo informa. */
  protected readonly canAct = computed(() => this.canConfirm() && this.proposal()?.status === 'KG_LIKELY');
  protected readonly visible = computed(() => !!this.proposal() || !!this.applied());

  /** Resultado de la última confirmación de ESTA carga, con las cifras del servidor. */
  protected readonly outcomeText = computed(() => {
    const outcome = this.facade.outcome();

    if (!outcome || outcome.importId !== this.importId()) return null;

    const { result } = outcome;

    if (result.unchanged) return result.unit === 'KG' ? 'La carga ya estaba en kilogramos: no se cambió nada.' : 'La carga ya estaba en toneladas: no se cambió nada.';

    return result.unit === 'KG'
      ? `Listo: ${formatCount(result.rowsConverted)} de ${formatCount(result.rowsUpdated)} viajes quedaron convertidos a toneladas. Los totales ya los incluyen.`
      : 'Listo: la carga se mantiene en toneladas.';
  });
}
