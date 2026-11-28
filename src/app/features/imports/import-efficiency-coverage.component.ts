import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { EfficiencyCoverage } from '../../domain/models/imports';
import { ImportEfficiencyFacade } from './import-efficiency.facade';
import { formatCount, licenceNote, tripsCount, vehiclesCount } from './imports.labels';

const KM_PER_GAL = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 });

/** Aviso fijo de todo lo estimado con una referencia: es teórico, no una medición (sin nombrar la fuente: ese dato es del servidor). */
export const COVERAGE_THEORETICAL = 'Es un valor teórico de una referencia técnica, no una medición de tu flota. Puedes declarar el rendimiento real de cada vehículo y reemplazarlo cuando quieras.';

/**
 * «Rendimiento de los vehículos» de la revisión: cuántos vehículos de la carga ya tienen rendimiento, cuáles se pueden estimar con una referencia
 * técnica (teórico), cuáles no y por qué. Las cifras y los textos de motivos vienen del servidor; la pantalla no estima ni infiere. En modo ASK
 * quien tiene `vehicles:manage` consiente (o no); en AUTO solo se explica; apagado, no se muestra nada.
 */
@Component({
  selector: 'app-import-efficiency-coverage',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      section { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      h3 { margin: 0; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      p { margin: 0; font-size: 0.9rem; color: var(--c-text); }
      p.small, small { font-size: 0.82rem; color: var(--c-mu); }
      p.warn { color: var(--c-warning); background: var(--c-warning-bg); padding: 6px 10px; border-radius: 8px; }
      ul.refs { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 4px; font-size: 0.88rem; }
      ul.refs li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 4px 8px; }
      ul.refs .src { font-weight: 700; color: var(--c-head); }
      ul.refs .lic { color: var(--c-warning); font-size: 0.8rem; font-weight: 600; }
      details summary { cursor: pointer; font-size: 0.86rem; color: var(--c-text2); }
      details summary:focus-visible, .actions button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      details ul { margin: 6px 0 0; padding-left: 18px; font-size: 0.86rem; }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .done { color: var(--c-success); font-weight: 600; }
      .err { color: var(--c-danger); font-weight: 600; }
    `,
  ],
  template: `
    @if (visible()) {
      <section aria-labelledby="eff-title" data-testid="efficiency-coverage">
        <h3 id="eff-title">Rendimiento de los vehículos</h3>
        <p data-testid="coverage-summary">{{ vehicles(c().vehiclesInFile) }} en el archivo: {{ c().withOwnEfficiency.vehicles }} con rendimiento propio · {{ c().alreadyEstimated.vehicles }} ya estimados · {{ c().without.vehicles }} sin rendimiento</p>

        @if (c().without.estimable.vehicles > 0) {
          <p data-testid="coverage-estimable"><strong>{{ vehicles(c().without.estimable.vehicles) }}</strong> ({{ trips(c().without.estimable.trips) }}) se pueden estimar con una referencia técnica.@if (c().without.estimable.unregisteredVehicles > 0) { <small> {{ c().without.estimable.unregisteredVehicles }} aún sin registrar: se estiman al registrarlos.</small> }</p>
          <ul class="refs" aria-label="Referencias técnicas" data-testid="coverage-references">
            @for (r of c().without.estimable.references; track $index) {
              <li>
                <span class="src">{{ r.source }}</span>
                @if (r.valueKmPerGal !== null) { <span>{{ num(r.valueKmPerGal) }} {{ r.unit }}@if (r.uncertaintyLow !== null && r.uncertaintyHigh !== null) { (rango {{ num(r.uncertaintyLow) }} a {{ num(r.uncertaintyHigh) }}) }</span> }
                <small>{{ vehicles(r.vehicles) }}</small>
                @if (licence(r.licenceStatus); as note) { <span class="lic" data-testid="coverage-licence">{{ note }}</span> }
              </li>
            }
          </ul>
        }
        @if (c().without.blockedByLicence.vehicles > 0) {
          <p data-testid="coverage-blocked">{{ vehicles(c().without.blockedByLicence.vehicles) }} ({{ trips(c().without.blockedByLicence.trips) }}): {{ c().without.blockedByLicence.message }}</p>
        }
        @if (c().without.noReference.vehicles > 0) {
          <details data-testid="coverage-no-reference">
            <summary>{{ vehicles(c().without.noReference.vehicles) }} sin referencia técnica ({{ trips(c().without.noReference.trips) }})</summary>
            <ul>@for (reason of c().without.noReference.reasons; track reason.code) { <li>{{ reason.label }}: {{ vehicles(reason.vehicles) }}, {{ trips(reason.trips) }}</li> }</ul>
          </details>
        }
        @if (c().tripsWithoutDistance.trips > 0) {
          <p class="small" data-testid="coverage-no-distance">{{ trips(c().tripsWithoutDistance.trips) }} de {{ vehicles(c().tripsWithoutDistance.vehicles) }} no traen distancia: estimar el rendimiento no los calcula.</p>
        }
        @if (hasEstimates()) { <p class="warn" data-testid="coverage-theoretical">{{ theoretical }}</p> }

        @if (c().estimation.mode === 'AUTO') {
          <p class="small" data-testid="coverage-auto">Tu empresa estima el rendimiento automáticamente al importar, con estas referencias técnicas. Un administrador puede cambiarlo en Configuración.</p>
        } @else if (c().estimation.requiresConsent) {
          @if (c().estimation.consent; as consent) {
            <p data-testid="coverage-consent">{{ consent.estimate ? 'Autorizaste estimar con referencia técnica (teórico).' : 'Elegiste no estimar el rendimiento de esta carga.' }}</p>
          }
          @if (!canManage()) {
            <p class="small" data-testid="coverage-readonly">Un administrador decide si se estima el rendimiento de los vehículos sin dato.</p>
          } @else if (c().without.estimable.vehicles > 0) {
            <div class="actions" data-testid="coverage-actions">
              @if (c().estimation.consent?.estimate !== true) {
                <button type="button" class="btn btn-primary btn-sm" data-testid="coverage-estimate" [disabled]="facade.busy() !== null" [attr.aria-busy]="facade.busy() === true" (click)="facade.consent(importId(), true)">{{ facade.busy() === true ? 'Estimando…' : 'Estimar con referencia técnica (teórico)' }}</button>
              }
              @if (c().estimation.consent?.estimate !== false) {
                <button type="button" class="btn btn-secondary btn-sm" data-testid="coverage-skip" [disabled]="facade.busy() !== null" [attr.aria-busy]="facade.busy() === false" (click)="facade.consent(importId(), false)">{{ facade.busy() === false ? 'Guardando…' : 'No estimar' }}</button>
              }
            </div>
          }
        }

        <div aria-live="polite">
          @if (outcomeText(); as t) { <p class="done" role="status" data-testid="coverage-result">{{ t }}</p> }
          @if (facade.error(); as e) { <p class="err" role="alert" data-testid="coverage-error">{{ e.message }}</p> }
        </div>
      </section>
    }
  `,
})
export class ImportEfficiencyCoverageComponent {
  protected readonly facade = inject(ImportEfficiencyFacade);
  private readonly access = inject(AccessPolicy);

  readonly importId = input.required<string>();
  readonly coverage = input.required<EfficiencyCoverage>();

  protected readonly theoretical = COVERAGE_THEORETICAL;
  protected readonly vehicles = vehiclesCount;
  protected readonly trips = tripsCount;
  protected readonly licence = licenceNote;
  protected readonly num = (value: number): string => KM_PER_GAL.format(value);

  protected readonly c = this.coverage;
  protected readonly canManage = computed(() => this.access.can('vehicles:manage'));
  /** Apagado (modo OFF o bandera global del servidor): no se muestra nada. */
  protected readonly visible = computed(() => this.coverage().estimation.canEstimate);
  protected readonly hasEstimates = computed(() => this.coverage().without.estimable.vehicles > 0 || this.coverage().alreadyEstimated.vehicles > 0);

  protected readonly outcomeText = computed(() => {
    const outcome = this.facade.outcome();

    if (!outcome || outcome.importId !== this.importId()) return null;

    const { result } = outcome;

    if (!result.estimateEfficiency) return 'Listo: no se estimará el rendimiento de esta carga.';

    return `Estimamos el rendimiento de ${vehiclesCount(result.vehiclesEstimated)}: ${tripsCount(result.tripsCalculated)} calculados y ${formatCount(result.tripsStillPending)} siguen pendientes.`;
  });
}
