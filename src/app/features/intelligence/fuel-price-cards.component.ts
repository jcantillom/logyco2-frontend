import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { IntelligenceFacade } from './intelligence.facade';

/** Estilos de las tarjetas de combustible del resumen (precios y factores de emisión): una sola hoja para que luzcan igual. */
const FUEL_CARD_STYLES = `
      :host { display: block; }
      .fp-grid { display: grid; gap: 12px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .fp-card { display: flex; flex-direction: column; gap: 3px; padding: 10px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); min-width: 0; }
      .fp-top { display: flex; align-items: center; gap: 10px; }
      .fp-ico { display: grid; place-items: center; width: 34px; height: 34px; border-radius: 10px; background: var(--c-ok-soft); color: var(--c-accent); flex: none; }
      .fp-ico svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .fp-card strong { font-size: 0.82rem; color: var(--c-head); }
      .fp-value { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; color: var(--c-head); }
      .fp-value small { font-size: 0.72rem; font-weight: 600; color: var(--c-mu); letter-spacing: 0; }
      .fp-meta, .fp-src { font-size: 0.72rem; color: var(--c-mu); overflow-wrap: anywhere; }
      .fp-chg { font-size: 0.78rem; font-weight: 700; color: var(--c-text2); }
      .fp-chg.down { color: var(--c-accent); } .fp-chg.up { color: var(--c-bad); }
      .fp-grid.compact { gap: 10px; } .fp-grid.compact .fp-card { padding: 6px 12px; gap: 1px; } .fp-grid.compact .fp-ico { width: 28px; height: 28px; } .fp-grid.compact .fp-ico svg { width: 16px; height: 16px; } .fp-grid.compact .fp-value { font-size: 1.25rem; }
      @media (max-width: 1200px) { .fp-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
      @media (max-width: 560px) { .fp-grid { grid-template-columns: 1fr; } }
`;

/** Tarjetas de precios de referencia de combustibles (ACPM, gasolina y GNCV): se usan en el resumen de la consola y en el de la empresa. */
@Component({
  selector: 'app-fuel-price-cards',
  imports: [ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [FUEL_CARD_STYLES],
  template: `
    <app-resource-state [status]="intel.summary.status()" [error]="intel.summary.error()" (retry)="intel.loadSummary()">
      <div class="fp-grid" [class.compact]="compact()">
        @for (c of fuelCards(); track c.code) {
          <div class="fp-card" [attr.data-fuel]="c.code">
            <span class="fp-top"><span class="fp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="c.icon" /></svg></span><strong>{{ c.title }}</strong></span>
            <span class="fp-value">{{ c.value }} <small>{{ c.unit }}</small></span>
            <span class="fp-meta">{{ c.meta }}</span>
            @if (c.change) { <span class="fp-chg" [class.up]="c.up" [class.down]="c.down">{{ c.change }}</span> }
            @if (c.sourceUrl) { <a [href]="c.sourceUrl" target="_blank" rel="noopener noreferrer" class="fp-src">{{ c.source }}</a> } @else { <small class="fp-src">{{ c.source }}</small> }
          </div>
        }
      </div>
    </app-resource-state>
  `,
})
export class FuelPriceCardsComponent {
  /** Versión baja (resumen de la empresa). */
  readonly compact = input(false);
  protected readonly intel = inject(IntelligenceFacade);

  /** Valor vigente, ciudad, variación frente a la publicación anterior y fuente. */
  protected readonly fuelCards = computed(() => {
    const icons: Readonly<Record<string, string>> = {
      FUEL_ACPM_PRICE: 'M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M4 21h12M7 8h6M15 9h2a2 2 0 0 1 2 2v5a1.5 1.5 0 0 0 3 0V8l-3-3',
      FUEL_GASOLINE_PRICE: 'M12 3s6 6.2 6 11a6 6 0 0 1-12 0c0-4.8 6-11 6-11zM9.5 14.5a2.5 2.5 0 0 0 2.5 2.5',
      FUEL_GNCV_PRICE: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10',
    };
    const money = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 0 });
    const pct = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });
    const titles: Readonly<Record<string, string>> = { FUEL_ACPM_PRICE: 'ACPM', FUEL_GASOLINE_PRICE: 'Gasolina corriente', FUEL_GNCV_PRICE: 'Gas natural vehicular' };
    const cards = this.intel.summary.data()?.featured ?? [];

    return Object.keys(titles).map((code) => {
      const card = cards.find((c) => c.code === code);

      if (!card || card.status !== 'AVAILABLE' || card.value === null) {
        return { code, icon: icons[code], title: titles[code], value: '—', unit: '', meta: 'Sin información disponible', change: '', up: false, down: false, source: card?.source.publisher ?? '', sourceUrl: null as string | null };
      }

      const change = card.variation?.previousPct ?? card.variation?.monthlyPct ?? null;
      const since = card.validFrom ?? card.referencePeriod;

      return {
        code, icon: icons[code], title: titles[code], value: `$ ${money.format(card.value)}`, unit: card.unit,
        meta: `${card.areaName}${since ? ` · desde ${since.toLocaleDateString('es-CO', { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}`,
        change: change === null ? '' : `${change > 0 ? '↑ ' : change < 0 ? '↓ ' : ''}${pct.format(Math.abs(change))} % ${card.variation?.previousPct != null ? 'vs. publicación anterior' : 'vs. mes anterior'}`,
        up: (change ?? 0) > 0, down: (change ?? 0) < 0,
        source: card.sourceReference ? `${card.source.publisher} · ${card.sourceReference}` : card.source.publisher, sourceUrl: card.sourceUrl ?? card.source.url,
      };
    });
  });
}
