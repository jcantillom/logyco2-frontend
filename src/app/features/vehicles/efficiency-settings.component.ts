import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { EstimationMode } from '../../domain/models/imports';
import { CargoUnitMode } from '../../domain/models/vehicle-efficiency';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { EfficiencySettingsFacade } from './efficiency-settings.facade';

interface Option<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly hint: string;
}

/** Textos de las opciones que el servidor acepta (las opciones y su orden son del servidor; aquí solo se rotulan). */
const MODE_OPTIONS: Readonly<Record<EstimationMode, Option<EstimationMode>>> = {
  OFF: { value: 'OFF', label: 'No estimar', hint: 'Los viajes sin rendimiento quedan pendientes hasta que lo declares.' },
  ASK: { value: 'ASK', label: 'Preguntar en cada carga', hint: 'Un administrador decide, carga por carga, si se estima con una referencia técnica (teórico).' },
  AUTO: { value: 'AUTO', label: 'Estimar automáticamente', hint: 'Al importar se estima con una referencia técnica (teórico) lo que no tenga rendimiento.' },
};

const CARGO_OPTIONS: Readonly<Record<CargoUnitMode, Option<CargoUnitMode>>> = {
  ASK: { value: 'ASK', label: 'Preguntar', hint: 'Si una columna parece estar en kilogramos, te lo proponemos y tú confirmas.' },
  AUTO_KG: { value: 'AUTO_KG', label: 'Usar kg cuando se detecte', hint: 'Convertimos a toneladas sin preguntar cuando el servidor detecta kilogramos; lo dudoso nunca se convierte.' },
};

/**
 * Ajustes de la empresa para la importación: estimar el rendimiento de los vehículos y convertir la carga de kilogramos a toneladas.
 * Cambiarlos es de quien tiene `vehicles:manage` (ORG_ADMIN); los demás los ven sin poder editarlos. El servidor guarda y responde: lo mostrado
 * es siempre lo que respondió.
 */
@Component({
  selector: 'app-efficiency-settings',
  imports: [ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      fieldset { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 8px; margin: 12px 0 0; padding: 0; border: 0; min-width: 0; }
      legend { padding: 0; font-weight: 600; color: var(--c-mu); font-size: 0.84rem; }
      .opt { position: relative; display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: var(--radius); cursor: pointer; background: var(--c-sf); }
      .opt input { position: absolute; opacity: 0; inset: 0; cursor: pointer; }
      .opt:has(input:checked) { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary); background: var(--c-s2); }
      .opt:has(input:focus-visible) { outline: 2px solid var(--c-focus); outline-offset: 2px; }
      .opt:has(input:disabled) { cursor: default; opacity: 0.8; }
      .opt strong { color: var(--c-head); }
      .opt small { color: var(--c-mu); }
      .hint { color: var(--c-mu); font-size: 0.84rem; margin: 10px 0 0; }
      .err { color: var(--c-danger); font-weight: 600; font-size: 0.86rem; margin: 10px 0 0; }
    `,
  ],
  template: `
    <app-resource-state [status]="facade.settings.status()" [error]="facade.settings.error()" (retry)="facade.load()">
      @if (facade.settings.data(); as s) {
        <div data-testid="efficiency-settings">
          @if (!s.platformEnabled) { <p class="hint" data-testid="settings-platform-off">La estimación del rendimiento no está disponible en la plataforma por ahora: el modo que elijas se aplicará cuando lo esté.</p> }

          @for (attempt of [facade.saveFailures()]; track attempt) {
          <fieldset [disabled]="!facade.canManage() || facade.saving()" data-testid="settings-mode">
            <legend>Rendimiento de los vehículos al importar</legend>
            @for (o of modes(s.modeOptions); track o.value) {
              <label class="opt">
                <input type="radio" name="est-mode" [value]="o.value" [checked]="s.mode === o.value" (change)="setMode(o)" />
                <strong>{{ o.label }}</strong>
                <small>{{ o.hint }}</small>
              </label>
            }
          </fieldset>
          }

          @for (attempt of [facade.saveFailures()]; track attempt) {
          <fieldset [disabled]="!facade.canManage() || facade.saving()" data-testid="settings-cargo">
            <legend>Carga declarada en kilogramos</legend>
            @for (o of cargoModes(s.cargoUnitOptions); track o.value) {
              <label class="opt">
                <input type="radio" name="cargo-mode" [value]="o.value" [checked]="s.cargoUnitMode === o.value" (change)="setCargo(o)" />
                <strong>{{ o.label }}</strong>
                <small>{{ o.hint }}</small>
              </label>
            }
          </fieldset>
          }

          @if (!facade.canManage()) { <p class="hint" data-testid="settings-readonly">Solo un administrador de la empresa puede cambiar estos ajustes.</p> }
          <div aria-live="polite">
            @if (facade.announcement(); as a) { <p class="hint" role="status" data-testid="settings-saved">{{ a }}</p> }
            @if (facade.saveError(); as e) { <p class="err" role="alert" data-testid="settings-error">{{ e.message }}</p> }
          </div>
        </div>
      }
    </app-resource-state>
  `,
})
export class EfficiencySettingsComponent {
  protected readonly facade = inject(EfficiencySettingsFacade);

  constructor() {
    this.facade.load();
  }

  protected modes(options: readonly EstimationMode[]): readonly Option<EstimationMode>[] {
    return options.map((option) => MODE_OPTIONS[option]);
  }

  protected cargoModes(options: readonly CargoUnitMode[]): readonly Option<CargoUnitMode>[] {
    return options.map((option) => CARGO_OPTIONS[option]);
  }

  protected setMode(option: Option<EstimationMode>): void {
    this.facade.update({ mode: option.value }, `Rendimiento al importar: ${option.label.toLowerCase()}.`);
  }

  protected setCargo(option: Option<CargoUnitMode>): void {
    this.facade.update({ cargoUnitMode: option.value }, `Carga en kilogramos: ${option.label.toLowerCase()}.`);
  }
}
