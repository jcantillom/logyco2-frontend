import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { CardHeadComponent } from './card-head.component';
import { FormulaInfo, FormulaInfoComponent } from './formula-info.component';
import { GlyphComponent } from './glyph.component';

const FORMULAS: readonly (FormulaInfo & { readonly summary: string; readonly label: string })[] = [
  { n: 1, title: 'Rendimiento del vehículo', summary: 'Km recorridos por cada galón.', explanation: 'Indica cuántos kilómetros recorre el vehículo con un galón de combustible.', label: 'Rendimiento en kilómetros por galón es igual a kilómetros recorridos dividido entre galones consumidos', variables: [{ name: 'Kilómetros recorridos', unit: 'km' }, { name: 'Galones consumidos', unit: 'gal' }] },
  { n: 2, title: 'Combustible consumido', summary: 'Galones para una distancia.', explanation: 'Estima los galones necesarios para una distancia determinada.', label: 'Galones es igual a distancia en kilómetros dividida entre rendimiento en kilómetros por galón', variables: [{ name: 'Distancia', unit: 'km' }, { name: 'Rendimiento', unit: 'km/gal' }] },
  { n: 3, title: 'Emisiones de CO₂', summary: 'CO₂ asociado al consumo.', explanation: 'Calcula las emisiones de CO₂ asociadas al consumo de combustible.', label: 'Kilogramos de CO₂ es igual a galones por factor en kilogramos de CO₂ por galón', variables: [{ name: 'Galones', unit: 'gal' }, { name: 'Factor', unit: 'kg CO₂/gal' }] },
];

/** Tarjeta «Fórmulas de cálculo»: tres filas con la fórmula maquetada; la ayuda de cada una (variables y ejemplo) se abre con ⓘ. */
@Component({
  selector: 'app-formulas',
  imports: [CardHeadComponent, GlyphComponent, FormulaInfoComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; }
    section { display: flex; flex-direction: column; height: 100%; padding: clamp(10px, 1.6vh, 16px) clamp(12px, 1.3vw, 18px); border-radius: 16px; }
    ol { display: flex; flex-direction: column; justify-content: space-around; flex: 1 1 auto; margin: clamp(2px, 0.6vh, 8px) 0 0; padding: 0; list-style: none; }
    li { display: grid; grid-template-columns: auto minmax(0, 1fr) minmax(0, 1.3fr) auto; align-items: center; gap: clamp(8px, 0.9vw, 12px); padding: clamp(3px, 1vh, 12px) 0; }
    li + li { border-top: 1px solid var(--c-bd); }
    .num { display: grid; place-items: center; width: clamp(24px, 3.8vh, 34px); height: clamp(24px, 3.8vh, 34px); border-radius: 50%; background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-head); font-weight: 700; font-size: 0.85rem; }
    h3 { margin: 0; font-size: 0.9rem; line-height: 1.25; color: var(--c-head); }
    .desc { margin: 1px 0 0; font-size: 0.76rem; line-height: 1.25; color: var(--c-mu); }
    .math { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 6px; padding: clamp(3px, 1vh, 10px) 10px; border-radius: 10px; border-left: 3px solid var(--c-primary); background: var(--c-s2); color: var(--c-head); font-weight: 700; font-size: clamp(0.78rem, 0.8vw, 0.88rem); line-height: 1.25; text-align: center; }
    .frac { display: inline-flex; flex-direction: column; align-items: center; }
    .frac > span:first-child { padding: 0 6px 1px; border-bottom: 2px solid currentColor; }
    .frac > span:last-child { padding: 1px 6px 0; }
    .info { display: grid; place-items: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 50%; background: none; color: var(--c-head); font-size: 19px; cursor: pointer; }
    .info:hover { background: var(--c-s3); }
    .note { margin: 0; padding-top: clamp(4px, 0.8vh, 8px); border-top: 1px solid var(--c-bd); font-size: 0.74rem; line-height: 1.3; color: var(--c-mu); }
    @media (max-width: 1199px) { li { grid-template-columns: auto minmax(0, 1fr) auto; } .math { grid-column: 2 / 3; grid-row: 2; } }
  `],
  template: `
    <section class="card" aria-labelledby="formulas-title" data-testid="section-formulas">
      <app-card-head icon="fx" titleId="formulas-title" title="Fórmulas de cálculo" subtitle="Métodos para estimar el rendimiento, el consumo y las emisiones de CO₂." />
      <ol>
        @for (f of formulas; track f.n) {
          <li [attr.data-testid]="'formula-' + f.n">
            <span class="num" aria-hidden="true">{{ f.n }}</span>
            <div>
              <h3>{{ f.title }}</h3>
              <p class="desc" [attr.title]="f.explanation">{{ f.summary }}</p>
            </div>
            <div class="math" role="math" [attr.aria-label]="f.label">
              @switch (f.n) {
                @case (1) { <span>Rendimiento (km/gal) =</span><span class="frac"><span>km recorridos</span><span>galones consumidos</span></span> }
                @case (2) { <span>Galones =</span><span class="frac"><span>Distancia (km)</span><span>Rendimiento (km/gal)</span></span> }
                @default { <span>kg CO₂ = Galones × Factor (kg CO₂/gal)</span> }
              }
            </div>
            <button type="button" class="info" [attr.aria-label]="'Ayuda de la fórmula ' + f.n + ': ' + f.title" [attr.data-testid]="'formula-help-' + f.n" (click)="open(f, $event)"><app-glyph name="info" /></button>
          </li>
        }
      </ol>
      <p class="note" data-testid="formulas-footnote">Con gas natural el volumen se expresa en m³ estándar y el rendimiento en km/m³.</p>
      @if (info(); as formula) { <app-formula-info [formula]="formula" (closed)="close()" /> }
    </section>
  `,
})
export class FormulasComponent {
  protected readonly formulas = FORMULAS;
  protected readonly info = signal<FormulaInfo | null>(null);
  private opener: HTMLElement | null = null;

  protected open(formula: FormulaInfo, event: Event): void {
    this.opener = event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
    this.info.set(formula);
  }

  protected close(): void {
    this.info.set(null);
    this.opener?.focus();
    this.opener = null;
  }
}
