import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { EmissionFactor } from '../../domain/models/emissions';
import { CalcSceneComponent } from './calc-scene.component';
import { CardHeadComponent } from './card-head.component';
import { EmissionsFacade } from './emissions.facade';
import { BLOCKED_REASON, formatFixed2, formatReceived, shortFuelName, unitLabel, volumeNoun, volumeTitle } from './emissions.format';
import { MAX_DISTANCE_KM, MAX_EFFICIENCY, parseDecimal, positiveDecimal } from './emissions.validators';
import { GlyphComponent } from './glyph.component';

const NUMBER = new Intl.NumberFormat('es-CO');

/** Tiempo mínimo que se ve la animación del camión, aunque la API responda antes (con «reducir movimiento» no hay espera). */
export const MIN_TRUCK_ANIMATION_MS = 1100;

/** Tarjeta «Simula las emisiones de un recorrido»: envía combustible, distancia y rendimiento al servidor y muestra lo que responde; no calcula emisiones. */
@Component({
  selector: 'app-emissions-simulator',
  imports: [ReactiveFormsModule, CardHeadComponent, GlyphComponent, CalcSceneComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; }
    section { display: flex; flex-direction: column; justify-content: space-between; height: 100%; padding: clamp(10px, 1.6vh, 16px) clamp(12px, 1.3vw, 18px); border-radius: 16px; }
    .fuelbox { display: flex; flex-direction: column; align-items: flex-end; gap: 2px; }
    .seg { display: flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
    .seg button { padding: clamp(2px, 0.4vh, 4px) 10px; border: 0; border-radius: 7px; background: none; color: var(--c-mu); font: inherit; font-size: 0.76rem; font-weight: 600; cursor: pointer; }
    .seg button[aria-pressed='true'] { background: var(--c-primary); color: var(--c-gray-50); }
    .unit-hint { font-size: 0.7rem; color: var(--c-mu); }
    form { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) auto; gap: 4px 14px; align-items: start; margin-top: clamp(6px, 1.2vh, 12px); }
    .field { gap: 3px; }
    .field label { font-size: 0.84rem; }
    .control { position: relative; }
    .control .input { min-height: clamp(38px, 5vh, 48px); padding-right: 76px; border-radius: 10px; }
    .suffix { position: absolute; top: 50%; right: 6px; transform: translateY(-50%); padding: 2px 10px; border-radius: 6px; background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-head); font-size: 0.78rem; font-weight: 700; pointer-events: none; white-space: nowrap; }
    .field-error { display: flex; align-items: center; gap: 5px; font-size: 0.8rem; }
    .go { align-self: end; min-width: 9.5rem; min-height: clamp(38px, 5vh, 48px); }
    .spin { width: 1em; height: 1em; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; }
    .live { margin-top: clamp(6px, 1.2vh, 12px); }
    .results { position: relative; box-sizing: border-box; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr) minmax(0, 1fr); margin: 0; padding: clamp(6px, 1vh, 12px) 4px; list-style: none; border-radius: 14px; background: var(--c-s2); }
    .tile { display: flex; align-items: center; gap: 10px; padding: 2px 12px; min-width: 0; }
    .tile + .tile { border-left: 1px solid color-mix(in srgb, var(--c-primary) 40%, transparent); }
    .tile > app-glyph { font-size: clamp(22px, 3.4vh, 30px); color: var(--c-primary); }
    .tile div { min-width: 0; }
    .tile span { display: block; font-size: 0.78rem; color: var(--c-mu); }
    .tile b { display: block; font-size: clamp(1rem, 1.1vw + 0.5vh, 1.3rem); line-height: 1.2; color: var(--c-head); font-variant-numeric: tabular-nums; }
    .tile b small { font-size: 0.6em; font-weight: 700; }
    .tile .key { font-size: clamp(1.5rem, 1.6vw + 0.9vh, 2rem); line-height: 1.1; font-weight: 800; color: var(--c-primary); }
    .tile .key small { color: var(--c-head); font-size: 0.5em; }
    .na { font-size: 1rem; }
    .tile:has(.why-btn) .na { color: var(--c-warning); }
    .why-btn { margin-left: 6px; padding: 0 8px; border: 1px solid var(--c-primary-400); border-radius: 999px; background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-head); font: inherit; font-size: 0.72rem; font-weight: 600; cursor: pointer; }
    .why { position: absolute; z-index: 6; top: calc(100% + 6px); left: 33%; right: 0; max-height: 9em; overflow-y: auto; margin: 0; padding: 10px 14px; border: 1px solid var(--c-dot-warning); border-radius: 10px; background: var(--c-warning-bg); box-shadow: var(--shadow); font-size: 0.82rem; color: var(--c-warning); list-style: none; }
    .scene { position: relative; grid-column: 1 / -1; height: 100%; min-height: 3.5rem; margin: -6px 0; }
    .empty { grid-column: 1 / -1; display: flex; align-items: center; justify-content: center; gap: 14px; color: var(--c-mu); font-size: 0.86rem; }
    .empty app-glyph { font-size: clamp(22px, 3.4vh, 30px); color: color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); }
    .errline { display: flex; align-items: center; padding: 0 14px; border-radius: 14px; background: var(--c-danger-bg); color: var(--c-danger); font-size: 0.86rem; font-weight: 600; }
    .errline span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .fine { margin: clamp(3px, 0.6vh, 8px) 0 0; font-size: 0.72rem; line-height: 1.3; color: var(--c-mu); }
    .recap { margin-top: clamp(4px, 0.8vh, 10px); font-weight: 700; color: var(--c-head); }
    @media (prefers-reduced-motion: no-preference) {
      .tile { animation: reveal 0.4s ease-out both; }
      .tile:nth-child(2) { animation-delay: 0.08s; }
      .tile:nth-child(3) { animation-delay: 0.16s; }
      .spin { animation: spin 0.8s linear infinite; }
    }
    @keyframes reveal { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @keyframes spin { to { transform: rotate(360deg); } }
    /* Tablero de una pantalla: el panel de resultados mide lo mismo con cualquier contenido (los textos largos van en «¿Por qué?» y la ayuda oculta). */
    @media (min-width: 1200px) and (min-height: 700px) {
      .results, .errline { height: clamp(60px, 10vh, 104px); }
    }
    @media (max-width: 1199px) { .results { grid-template-columns: 1fr; gap: 12px; } .tile + .tile { border-left: 0; } .scene { min-height: 9.5rem; } }
    @media (max-width: 640px) { form { grid-template-columns: 1fr; } .go { width: 100%; } }
  `],
  template: `
    <section class="card" aria-labelledby="calculator-title" data-testid="section-calculator">
      <app-card-head icon="calculator" titleId="calculator-title" title="Simula las emisiones de un recorrido" subtitle="Ingresa la distancia y el rendimiento para estimar el consumo y las emisiones de CO₂.">
        <div class="fuelbox">
          <div class="seg" role="group" aria-label="Combustible">
            @for (f of fuels(); track f.fuelCode) {
              <button type="button" [attr.aria-pressed]="f.fuelCode === fuel()?.fuelCode" [attr.data-testid]="'sim-fuel-' + f.fuelCode" (click)="facade.fuelCode.set(f.fuelCode)">{{ short(f.name) }}</button>
            }
          </div>
          @if (efficiencyUnit()) { <span class="unit-hint" data-testid="unit-hint">Rendimiento en {{ efficiencyUnit() }}</span> }
        </div>
      </app-card-head>
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate data-testid="simulator-form">
        <div class="field">
          <label for="sim-distance">Distancia recorrida (km) <span aria-hidden="true">*</span></label>
          <div class="control">
            <input id="sim-distance" class="input" type="text" inputmode="decimal" autocomplete="off" required placeholder="Ingresa la distancia" formControlName="distance" [attr.aria-invalid]="invalid('distance')" [attr.aria-describedby]="invalid('distance') ? 'sim-distance-err' : null" />
            <span class="suffix" aria-hidden="true">km</span>
          </div>
          @if (invalid('distance')) { <span class="field-error" id="sim-distance-err" role="alert" data-testid="distance-error"><app-glyph name="info" />{{ message('distance') }}</span> }
        </div>
        <div class="field">
          <label for="sim-efficiency">Rendimiento del vehículo ({{ efficiencyUnit() }}) <span aria-hidden="true">*</span></label>
          <div class="control">
            <input id="sim-efficiency" class="input" type="text" inputmode="decimal" autocomplete="off" required placeholder="Ingresa el rendimiento" formControlName="efficiency" [attr.aria-invalid]="invalid('efficiency')" [attr.aria-describedby]="invalid('efficiency') ? 'sim-efficiency-err' : null" />
            <span class="suffix" aria-hidden="true" data-testid="efficiency-unit">{{ efficiencyUnit() }}</span>
          </div>
          @if (invalid('efficiency')) { <span class="field-error" id="sim-efficiency-err" role="alert" data-testid="efficiency-error"><app-glyph name="info" />{{ message('efficiency') }}</span> }
        </div>
        <button type="submit" class="btn btn-primary go" data-testid="simulate" [disabled]="form.invalid || !fuel() || loading()" [attr.aria-busy]="loading()">
          @if (loading()) { <span class="spin" aria-hidden="true"></span>Calculando… } @else { <app-glyph name="calculator" />Calcular }
        </button>
      </form>

      <div class="live" aria-live="polite" data-testid="simulation-live">
        @if (loading()) { <span class="sr-only" role="status">Calculando…</span> }
        @if (!animating() && facade.simulation.error(); as error) {
          <div class="errline" role="alert" data-testid="simulation-error" [attr.title]="error.message"><span>{{ error.message }}</span></div>
        } @else {
          <ul class="results" data-testid="simulation-result" [attr.aria-busy]="animating()">
            @if (animating()) {
              <li class="scene" data-testid="result-scene"><app-calc-scene [motion]="!reduce()" /></li>
            } @else if (facade.simulation.data(); as result) {
              @if (facade.simulation.status() === 'ready') {
                <li class="tile">
                  <app-glyph name="pump" />
                  <div><span data-testid="result-volume-label">{{ volumeTitle(result.volumeUnit) }}</span><b data-testid="result-volume">{{ fixed(result.volume) }} <small>{{ unit(result.volumeUnit) }}</small></b></div>
                </li>
                <li class="tile">
                  <app-glyph name="cloud" />
                  <div>
                    <span>Emisiones estimadas</span>
                    @if (result.official && result.co2Kg !== null) {
                      <b class="key" data-testid="result-co2">{{ fixed(result.co2Kg) }} <small>kg CO₂</small></b>
                    } @else {
                      <b class="na" data-testid="result-co2-blocked">No disponible</b>
                      <span data-testid="result-co2-reason">{{ reason(result.factor.status) }}<button type="button" class="why-btn" data-testid="why" [attr.aria-expanded]="whyOpen()" aria-controls="sim-why" (click)="whyOpen.set(!whyOpen())" (keydown.escape)="whyOpen.set(false)">¿Por qué?</button></span>
                    }
                  </div>
                </li>
                <li class="tile">
                  <app-glyph name="layers" />
                  <div>
                    <span>Factor utilizado</span>
                    @if (fmt(result.factor.value); as value) {
                      <b data-testid="result-factor">{{ value }} <small>{{ unit(result.factor.unit) }}</small></b>
                    } @else {
                      <b class="na" data-testid="result-factor-none">Sin factor configurado</b>
                    }
                  </div>
                </li>
                @if (!(result.official && result.co2Kg !== null)) {
                  <li class="sr-only" data-testid="result-message-sr">{{ result.message ?? 'No hay un factor verificado para estimar las emisiones.' }}</li>
                  @if (whyOpen()) { <li class="why" id="sim-why" role="note" data-testid="result-message">{{ result.message ?? 'No hay un factor verificado para estimar las emisiones.' }}</li> }
                }
              }
            } @else {
              <li class="empty" data-testid="result-empty"><app-glyph name="pump" /><app-glyph name="cloud" /><app-glyph name="layers" /><span>Ingresa distancia y rendimiento para ver el resultado</span></li>
            }
          </ul>
        }
      </div>
      @if (recap(); as text) { <p class="fine recap" data-testid="recap">{{ text }}</p> }
      <p class="fine">Estimación educativa, no es una medición certificada. No procesa archivos de Excel ni guarda las simulaciones.</p>
    </section>
  `,
})
export class SimulatorComponent {
  protected readonly facade = inject(EmissionsFacade);
  private readonly fb = inject(FormBuilder).nonNullable;

  protected readonly form = this.fb.group({
    distance: ['', positiveDecimal(MAX_DISTANCE_KM)],
    efficiency: ['', positiveDecimal(MAX_EFFICIENCY)],
  });
  /** Muestra el texto completo del servidor sobre el resultado bloqueado. */
  protected readonly whyOpen = signal(false);
  protected readonly reason = (status: EmissionFactor['status']): string => BLOCKED_REASON[status];
  protected readonly fuels = computed(() => this.facade.fuels.data() ?? []);
  /** Combustible elegido: el mismo de la tarjeta del factor (señal compartida en la fachada). */
  protected readonly fuel = this.facade.factor;
  /** La animación del camión está a la vista: desde «Calcular» hasta que hay respuesta y pasó el tiempo mínimo (el error la corta al instante). */
  protected readonly animating = signal(false);
  protected readonly reduce = signal(false);
  protected readonly loading = computed(() => this.animating() || this.facade.simulation.status() === 'loading');
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  protected readonly efficiencyUnit = computed(() => unitLabel(this.fuel()?.efficiencyUnit ?? ''));
  /** Fórmula resumida con las unidades del combustible elegido. */
  protected readonly recap = computed(() => {
    const fuel = this.fuel();

    return fuel ? `kg CO₂ = ${volumeNoun(fuel.volumeUnit)} (${unitLabel(fuel.volumeUnit)}) × factor (${unitLabel(fuel.unit)})` : null;
  });
  protected readonly short = shortFuelName;
  protected readonly fmt = formatReceived;
  protected readonly fixed = formatFixed2;
  protected readonly unit = unitLabel;
  protected readonly volumeTitle = volumeTitle;

  constructor() {
    effect(() => {
      const status = this.facade.simulation.status();
      untracked(() => this.onStatus(status));
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  private onStatus(status: string): void {
    if (!this.animating()) return;
    if (status === 'error') return this.finish();
    if (status !== 'ready') return;

    const wait = this.reduce() ? 0 : Math.max(0, MIN_TRUCK_ANIMATION_MS - (Date.now() - this.startedAt));
    if (wait === 0) this.finish();
    else this.timer = setTimeout(() => this.finish(), wait);
  }

  private finish(): void {
    clearTimeout(this.timer);
    this.animating.set(false);
  }

  protected invalid(name: 'distance' | 'efficiency'): boolean {
    const control = this.form.controls[name];

    return control.invalid && (control.touched || control.dirty);
  }

  protected message(name: 'distance' | 'efficiency'): string {
    const errors = this.form.controls[name].errors ?? {};
    const subject = name === 'distance' ? 'la distancia recorrida' : 'el rendimiento del vehículo';
    const max = name === 'distance' ? `${NUMBER.format(MAX_DISTANCE_KM)} km` : `${NUMBER.format(MAX_EFFICIENCY)} ${this.efficiencyUnit()}`;

    if (errors['required']) return `Ingresa ${subject}.`;
    if (errors['number']) return 'Escribe solo números, sin letras ni signos (por ejemplo 250 o 12,5).';
    if (errors['positive']) return 'El valor debe ser mayor que cero.';

    return `El valor máximo permitido es ${max}.`;
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    const fuel = this.fuel();
    if (this.form.invalid || !fuel) return;

    const { distance, efficiency } = this.form.getRawValue();
    const distanceKm = parseDecimal(distance);
    const value = parseDecimal(efficiency);
    if (distanceKm === null || value === null) return;

    this.whyOpen.set(false);
    clearTimeout(this.timer);
    this.reduce.set(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
    this.startedAt = Date.now();
    this.animating.set(true);
    this.facade.simulate({ fuelCode: fuel.fuelCode, distanceKm, efficiency: value });
  }
}
