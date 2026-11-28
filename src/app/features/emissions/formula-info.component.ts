import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { EmissionsFacade } from './emissions.facade';
import { factorValue, unitLabel } from './emissions.format';
import { parseDecimal } from './emissions.validators';

const RESULT = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 4 });

type InputName = 'km' | 'gallons' | 'distance' | 'efficiency' | 'gallons3';

export interface FormulaVariable { readonly name: string; readonly unit: string }
export interface FormulaInfo {
  readonly n: 1 | 2 | 3;
  readonly title: string;
  /** Explicación de una línea de la fórmula. */
  readonly explanation: string;
  readonly variables: readonly FormulaVariable[];
}

/** Ayuda de una fórmula en un diálogo: variables con sus unidades y un ejemplo ilustrativo con campos vacíos (nada precargado). */
@Component({
  selector: 'app-formula-info',
  imports: [CloseOnBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    dialog { width: min(480px, calc(100vw - 24px)); padding: 0; }
    .body { display: flex; flex-direction: column; gap: 12px; padding: 20px 22px; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    h2 { margin: 0; font-size: 1.1rem; color: var(--c-head); }
    .lead, .note { margin: 0; font-size: 0.9rem; color: var(--c-text); }
    .note { padding: 8px 10px; border-radius: 8px; background: var(--c-s2); font-size: 0.84rem; }
    ul { margin: 0; padding-left: 18px; font-size: 0.9rem; color: var(--c-text); }
    .demo { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px; padding: 10px 12px; border: 1px dashed var(--c-gray-300); border-radius: 10px; }
    .tag { flex: 1 0 100%; font-size: 0.78rem; font-weight: 600; color: var(--c-mu); }
    .field { flex: 1 1 130px; }
    .input { min-height: 38px; }
    .outcome { flex: 1 1 100%; margin: 0; font-size: 0.92rem; color: var(--c-head); }
  `],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog" [attr.aria-labelledby]="'formula-info-title-' + formula().n" (close)="closed.emit()" data-testid="formula-info">
      <div class="body">
        <header>
          <h2 [id]="'formula-info-title-' + formula().n">Fórmula {{ formula().n }}: {{ formula().title }}</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-testid="formula-info-close" (click)="close()">Cerrar</button>
        </header>
        <p class="lead">{{ formula().explanation }}</p>
        @if (formula().n !== 3) { <p class="note" data-testid="formulas-note">Usa la 1 si conoces el consumo; usa la 2 si conoces el rendimiento. Sin ninguno de los dos no se puede calcular.</p> }
        <ul aria-label="Variables">
          @for (v of formula().variables; track v.name) { <li><strong>{{ v.name }}</strong> ({{ v.unit }})</li> }
        </ul>
        @switch (formula().n) {
          @case (1) {
            <div class="demo" role="group" aria-label="Ejemplo ilustrativo de la fórmula 1">
              <span class="tag">Ilustración con tus propios números (no es el rendimiento de un camión típico)</span>
              <div class="field"><label for="ex1-km">Kilómetros recorridos</label><input id="ex1-km" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="Escribe los km" [value]="values().km" (input)="set('km', $event)" /></div>
              <div class="field"><label for="ex1-gal">Galones consumidos</label><input id="ex1-gal" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="Escribe los galones" [value]="values().gallons" (input)="set('gallons', $event)" /></div>
              <p class="outcome" aria-live="polite" data-testid="example-1">{{ efficiency() ? 'Rendimiento: ' + efficiency() + ' km/gal' : 'Escribe dos valores mayores que cero para ver el resultado.' }}</p>
            </div>
          }
          @case (2) {
            <div class="demo" role="group" aria-label="Ejemplo ilustrativo de la fórmula 2">
              <span class="tag">Ilustración con tus propios números (no es el rendimiento de un camión típico)</span>
              <div class="field"><label for="ex2-km">Distancia (km)</label><input id="ex2-km" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="Escribe los km" [value]="values().distance" (input)="set('distance', $event)" /></div>
              <div class="field"><label for="ex2-eff">Rendimiento (km/gal)</label><input id="ex2-eff" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="Escribe el rendimiento" [value]="values().efficiency" (input)="set('efficiency', $event)" /></div>
              <p class="outcome" aria-live="polite" data-testid="example-2">{{ fuel() ? 'Combustible: ' + fuel() + ' gal' : 'Escribe dos valores mayores que cero para ver el resultado.' }}</p>
            </div>
          }
          @default {
            @if (factorNumber() !== null) {
              <div class="demo" role="group" aria-label="Ejemplo ilustrativo de la fórmula 3">
                <span class="tag">Ilustración con el factor verificado de la plataforma ({{ factor()?.name }}: {{ factorText() }} {{ unit() }})</span>
                <div class="field"><label for="ex3-gal">Volumen ({{ volumeUnit() }})</label><input id="ex3-gal" class="input" type="text" inputmode="decimal" autocomplete="off" placeholder="Escribe los galones" [value]="values().gallons3" (input)="set('gallons3', $event)" /></div>
                <p class="outcome" aria-live="polite" data-testid="example-3">{{ co2() ? 'Emisiones: ' + co2() + ' kg CO₂' : 'Escribe un valor mayor que cero para ver el resultado.' }}</p>
              </div>
            } @else {
              <p class="outcome" data-testid="example-3-symbolic">El ejemplo numérico se activa cuando el factor del diésel B2 está verificado.</p>
            }
          }
        }
      </div>
    </dialog>
  `,
})
export class FormulaInfoComponent {
  private readonly facade = inject(EmissionsFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  readonly formula = input.required<FormulaInfo>();
  readonly closed = output();

  protected readonly values = signal<Record<InputName, string>>({ km: '', gallons: '', distance: '', efficiency: '', gallons3: '' });

  /** El factor solo se usa en el ejemplo si el servidor lo da por utilizable. */
  protected readonly factorNumber = computed(() => {
    const factor = this.facade.factor();
    const value = factor && factor.usableForCalculation ? factor.value : null;
    const number = value === null ? NaN : Number(value);

    return Number.isFinite(number) && number > 0 ? number : null;
  });
  protected readonly factor = this.facade.factor;
  protected readonly factorText = computed(() => {
    const factor = this.facade.factor();

    return factor ? factorValue(factor) : null;
  });
  protected readonly unit = computed(() => this.facade.factor()?.unitLabel || unitLabel(this.facade.factor()?.unit ?? ''));
  protected readonly volumeUnit = computed(() => unitLabel(this.facade.factor()?.volumeUnit ?? ''));
  protected readonly efficiency = computed(() => this.divide(this.values().km, this.values().gallons));
  protected readonly fuel = computed(() => this.divide(this.values().distance, this.values().efficiency));
  protected readonly co2 = computed(() => {
    const gallons = parseDecimal(this.values().gallons3);
    const factor = this.factorNumber();

    return gallons !== null && gallons > 0 && factor !== null ? RESULT.format(gallons * factor) : null;
  });

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (!dialog.open) dialog.showModal();
    });
  }

  protected set(name: InputName, event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.values.update((current) => ({ ...current, [name]: value }));
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  private divide(numerator: string, denominator: string): string | null {
    const top = parseDecimal(numerator);
    const bottom = parseDecimal(denominator);

    return top !== null && bottom !== null && top > 0 && bottom > 0 ? RESULT.format(top / bottom) : null;
  }
}
