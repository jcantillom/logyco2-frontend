import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, viewChildren } from '@angular/core';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { CardHeadComponent } from './card-head.component';
import { EmissionsFacade } from './emissions.facade';
import { FACTOR_STATUS, factorValue, shortFuelName, unitLabel } from './emissions.format';
import { GlyphComponent } from './glyph.component';

/**
 * Tarjeta «Factor de emisión»: selector de combustible con indicador deslizante (radiogroup con flechas) y un panel tipo «ticket» con el valor
 * muy grande, la unidad, el estado de verificación y, debajo, la fuente y el documento como texto. Todo lo entrega el servidor.
 */
@Component({
  selector: 'app-factor-card',
  imports: [ResourceStateComponent, CardHeadComponent, GlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; }
    section { display: flex; flex-direction: column; height: 100%; padding: clamp(10px, 1.6vh, 16px) clamp(12px, 1.3vw, 18px); border-radius: 16px; }
    .panel { position: relative; flex: 1 1 auto; display: flex; flex-direction: column; justify-content: space-between; gap: clamp(4px, 0.9vh, 12px); margin-top: clamp(6px, 1.2vh, 12px); padding: clamp(7px, 1.1vh, 11px) 14px clamp(8px, 1.2vh, 12px); border-radius: 14px 0 14px 14px; background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); box-shadow: inset 0 1px 0 color-mix(in srgb, var(--c-gray-50) 80%, transparent); /* Esquina cortada a 45° de la marca: el panel no lleva borde ni sombra exterior, así el corte queda limpio. */ clip-path: polygon(0 0, calc(100% - 16px) 0, 100% 16px, 100% 100%, 0 100%); }
    .panel.neutral { background: var(--c-s2); }
    .panel.neutral .pump { color: var(--c-mu); opacity: 0.6; }
    .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .seg { position: relative; display: grid; grid-auto-flow: column; grid-auto-columns: 1fr; padding: 3px; border: 1px solid var(--c-bd); border-radius: 999px; background: color-mix(in srgb, var(--c-sf) 80%, transparent); }
    .thumb { position: absolute; top: 3px; bottom: 3px; left: 3px; width: calc((100% - 6px) / var(--n)); border-radius: 999px; background: var(--c-primary); transform: translateX(calc(var(--i) * 100%)); transition: transform 0.25s cubic-bezier(.2, .7, .2, 1); }
    .seg button { position: relative; z-index: 1; display: inline-flex; align-items: center; justify-content: center; gap: 5px; padding: clamp(2px, 0.4vh, 4px) 10px; border: 0; border-radius: 999px; background: none; color: var(--c-mu); font: inherit; font-size: 0.76rem; font-weight: 600; white-space: nowrap; cursor: pointer; transition: color 0.2s; }
    .seg button[aria-checked='true'] { color: var(--c-gray-50); }
    .seg button app-glyph { font-size: 13px; }
    .hero { --block-h: clamp(72px, 8.6vh, 104px); --edge: clamp(8px, 1.6vw, 22px); position: relative; display: grid; grid-template-columns: 1fr 1fr; align-items: center; padding: 0 var(--edge); }
    /* Divisor discontinuo vertical al centro del panel: la composición se lee simétrica. */
    .hero::before { content: ''; position: absolute; left: 50%; top: 8%; bottom: 8%; border-left: 1px dashed color-mix(in srgb, var(--c-primary) 40%, transparent); }
    .pump { justify-self: center; font-size: var(--block-h); line-height: 1; color: var(--c-primary); }
    .main { justify-self: center; display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: var(--block-h); min-width: 0; text-align: center; }
    .value { margin: 0; font-size: clamp(1.9rem, 1.4vw + 1.3vh, 2.6rem); font-weight: 800; line-height: 1.05; letter-spacing: -0.02em; white-space: nowrap; color: var(--c-head); font-variant-numeric: tabular-nums; }
    .unit { margin: 2px 0 0; font-size: clamp(0.85rem, 0.45vw + 0.8vh, 1.05rem); font-weight: 700; line-height: 1.2; white-space: nowrap; color: var(--c-head); }
    .meta { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 2px 8px; margin: 2px 0 0; min-height: 1.4em; font-size: 0.8rem; color: var(--c-mu); }
    .pill { display: inline-flex; align-items: center; gap: 4px; padding: 2px 9px; border-radius: 8px; background: var(--c-success-bg); color: var(--c-success); font-size: 0.76rem; font-weight: 700; white-space: nowrap; }
    dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: clamp(3px, 0.8vh, 8px) 14px; margin: clamp(6px, 1.1vh, 11px) 2px 0; padding-top: clamp(6px, 1vh, 10px); border-top: 1px dashed color-mix(in srgb, var(--c-head) 20%, transparent); font-size: 0.82rem; }
    dl div { display: flex; align-items: flex-start; gap: 6px; min-width: 0; }
    dt { display: flex; align-items: center; gap: 5px; flex: none; font-weight: 600; color: var(--c-mu); }
    dd { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; margin: 0; min-width: 0; overflow: hidden; overflow-wrap: anywhere; line-height: 1.3; color: var(--c-head); }
    @media (prefers-reduced-motion: no-preference) {
      .swap { animation: swap 0.2s ease-out both; }
    }
    @keyframes swap { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } }
    @media (prefers-reduced-motion: reduce) { .thumb, .seg button { transition: none; } }
    @media (max-width: 1199px) { .hero { grid-template-columns: 1fr; gap: 8px; } .hero::before { display: none; } }
    @media (max-width: 480px) { dl { grid-template-columns: minmax(0, 1fr); } }
  `],
  template: `
    <section class="card" aria-labelledby="factor-title" data-testid="section-factor">
      <app-card-head icon="leaf" titleId="factor-title" title="Factor de emisión" [subtitle]="subtitle()" />
      <app-resource-state [fill]="true" [status]="facade.fuels.status()" [error]="facade.fuels.error()" (retry)="facade.loadFuels()">
        @if (facade.factor(); as factor) {
          <div class="panel" [class.neutral]="!showsValue()" data-testid="factor-card">
            <div class="top">
              <div class="seg" role="radiogroup" aria-label="Combustible" [style.--n]="count()" [style.--i]="index()">
                <span class="thumb" aria-hidden="true"></span>
                @for (f of facade.fuels.data(); track f.fuelCode) {
                  <button #opt type="button" role="radio" [attr.aria-checked]="f.fuelCode === factor.fuelCode" [attr.tabindex]="f.fuelCode === factor.fuelCode ? 0 : -1" [attr.data-testid]="'fuel-' + f.fuelCode" (click)="facade.fuelCode.set(f.fuelCode)" (keydown)="onKey($event)">
                    <app-glyph [name]="f.volumeUnit === 'm3' ? 'cloud' : 'pump'" />{{ short(f.name) }}
                  </button>
                }
              </div>
              @if (factor.status === 'VERIFIED') { <span class="pill" data-testid="factor-status"><app-glyph name="check" />{{ view().label }}</span> }
            </div>
            <div class="hero">
              <app-glyph class="pump" name="pump" />
              <div class="main" aria-live="polite" data-testid="factor-live">
                @for (current of [factor.fuelCode]; track current) {
                  <div class="swap">
                    @if (value(); as v) {
                      <p class="value" data-testid="factor-value">{{ v }}</p>
                      <p class="unit" data-testid="factor-unit">{{ unit() }}</p>
                    }
                    <p class="meta">
                      <span data-testid="factor-name">{{ factor.name }}</span>
                      @if (factor.status !== 'VERIFIED') { <span class="badge" [class]="view().badge" data-testid="factor-status">{{ view().label }}</span> }
                    </p>
                  </div>
                }
              </div>
            </div>
          </div>
          @if (hasSource()) {
            <dl>
              @if (factor.sourceName) { <div><dt><app-glyph name="doc" />Fuente</dt><dd data-testid="factor-source" [attr.title]="factor.sourceName">{{ factor.sourceName }}</dd></div> }
              @if (factor.sourceDocument) { <div><dt><app-glyph name="book" />Documento</dt><dd data-testid="factor-document" [attr.title]="factor.sourceDocument">{{ factor.sourceDocument }}</dd></div> }
            </dl>
          }
        }
      </app-resource-state>
    </section>
  `,
})
export class FactorCardComponent {
  protected readonly facade = inject(EmissionsFacade);
  private readonly options = viewChildren<ElementRef<HTMLButtonElement>>('opt');
  protected readonly short = shortFuelName;

  protected readonly view = computed(() => FACTOR_STATUS[this.facade.factor()?.status ?? 'NOT_CONFIGURED']);
  protected readonly showsValue = computed(() => this.view().showValue);
  protected readonly value = computed(() => {
    const factor = this.facade.factor();

    return factor ? factorValue(factor) : null;
  });
  protected readonly unit = computed(() => this.facade.factor()?.unitLabel || unitLabel(this.facade.factor()?.unit ?? ''));
  protected readonly count = computed(() => this.facade.fuels.data()?.length ?? 1);
  protected readonly index = computed(() => Math.max(0, (this.facade.fuels.data() ?? []).findIndex((f) => f.fuelCode === this.facade.factor()?.fuelCode)));
  protected readonly hasSource = computed(() => {
    const f = this.facade.factor();

    return !!f && (!!f.sourceName || !!f.sourceDocument);
  });
  protected readonly subtitle = computed(() => {
    const name = this.facade.factor()?.name;
    const fuel = name ? shortFuelName(name) : 'combustible';

    return `Este valor permite estimar las emisiones de CO₂ asociadas al consumo de ${fuel.charAt(0).toLowerCase()}${fuel.slice(1)}`;
  });

  /** Radiogroup: flechas, Inicio y Fin eligen el combustible y mueven el foco (el elegido es el único con tabindex 0). */
  protected onKey(event: KeyboardEvent): void {
    const fuels = this.facade.fuels.data() ?? [];
    const last = fuels.length - 1;
    const current = this.index();
    const target = { ArrowRight: current === last ? 0 : current + 1, ArrowDown: current === last ? 0 : current + 1, ArrowLeft: current === 0 ? last : current - 1, ArrowUp: current === 0 ? last : current - 1, Home: 0, End: last }[event.key];
    if (target === undefined || fuels.length === 0) return;

    event.preventDefault();
    this.facade.fuelCode.set(fuels[target].fuelCode);
    this.options()[target]?.nativeElement.focus();
  }
}
