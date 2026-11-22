import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TruckArtComponent } from './truck-art.component';

/**
 * Barra de avance con un camión sobre la carretera: con porcentaje, el camión avanza con la barra; sin él (`null`) recorre la
 * carretera en bucle. Solo anima transform y opacity. Con la preferencia de menos movimiento queda quieto y la barra se ve igual.
 */
@Component({
  selector: 'app-truck-progress',
  imports: [TruckArtComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; container-type: inline-size; }
      .lane { position: relative; height: 52px; }
      .truck { position: absolute; left: 0; bottom: 12px; width: 52px; transform: translateX(calc(var(--p, 0) * (100cqw - 52px))); transition: transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1); }
      .sm .lane { height: 24px; }
      .sm .truck { width: 30px; bottom: 5px; transform: translateX(calc(var(--p, 0) * (100cqw - 30px))); }
      .sm .puff { display: none; }
      .sm .track { height: 8px; }
      .sm .fill::after { display: none; }
      .sm.loop .truck { animation-name: drive-sm; }
      .puff { position: absolute; bottom: 26px; left: -4px; width: 7px; height: 7px; border-radius: 50%; background: color-mix(in srgb, var(--c-head) 22%, transparent); opacity: 0; }
      .track { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; border-radius: 999px; background: color-mix(in srgb, var(--c-head) 12%, var(--c-sf)); overflow: hidden; }
      .fill { position: absolute; inset: 0; border-radius: inherit; background: var(--c-primary); transform-origin: left center; transform: scaleX(var(--p, 0)); transition: transform 0.7s cubic-bezier(0.22, 0.61, 0.36, 1); }
      .fill::after { content: ''; position: absolute; inset: 0 -20px 0 0; background: repeating-linear-gradient(115deg, transparent 0 10px, color-mix(in srgb, var(--c-sf) 30%, transparent) 10px 20px); }
      .fill::after { animation: stripes 0.8s linear infinite; }
      .puff { animation: puff 0.9s ease-out infinite; }
      .puff:nth-of-type(2) { animation-delay: 0.3s; }
      .puff:nth-of-type(3) { animation-delay: 0.6s; }
      .loop .truck { animation: drive 2.2s linear infinite; transition: none; }
      .loop .fill { width: 35%; transform: none; animation: slide 2.2s linear infinite; }
      @keyframes drive { from { transform: translateX(-60px); } to { transform: translateX(calc(100cqw + 8px)); } }
      @keyframes drive-sm { from { transform: translateX(-34px); } to { transform: translateX(calc(100cqw + 8px)); } }
      @keyframes slide { from { transform: translateX(-100%); } to { transform: translateX(300%); } }
      @keyframes stripes { to { transform: translateX(20px); } }
      @keyframes puff { 0% { opacity: 0.8; transform: translate(0, 0) scale(0.6); } 100% { opacity: 0; transform: translate(-18px, -12px) scale(1.5); } }
      @media (prefers-reduced-motion: reduce) {
        .truck, .fill { transition: none; }
        .loop .truck, .sm.loop .truck { animation: none; transform: translateX(0); }
        .loop .fill { animation: none; transform: scaleX(0.35); width: 100%; }
        .fill::after, .puff { animation: none; }
      }
    `,
  ],
  template: `
    <div class="lane" [class.sm]="size() === 'sm'" [class.loop]="percent() === null" [style.--p]="fraction()"
         role="progressbar" [attr.aria-label]="label()" aria-valuemin="0" aria-valuemax="100" [attr.aria-valuenow]="percent()" data-testid="truck-progress">
      <div class="truck" aria-hidden="true">
        <span class="puff"></span><span class="puff"></span><span class="puff"></span>
        <app-truck-art [spinning]="true" />
      </div>
      <div class="track" aria-hidden="true"><div class="fill"></div></div>
    </div>
  `,
})
export class TruckProgressComponent {
  /** Avance de 0 a 100; `null` cuando no se conoce (el camión recorre la carretera en bucle). */
  readonly percent = input<number | null>(null);
  readonly label = input('Avance');
  /** `sm`: versión compacta (36 px de alto) para filas de una tabla. */
  readonly size = input<'md' | 'sm'>('md');

  protected readonly fraction = computed(() => {
    const value = this.percent();

    return value === null ? 0 : Math.min(1, Math.max(0, value / 100));
  });
}
