import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/**
 * Escena de «calculando»: un camión recorre el panel sobre una línea de carretera discontinua, con las ruedas girando y humo suave. Solo usa
 * transform y opacity. Sin movimiento (preferencia del sistema) queda el camión quieto y el texto. No muestra ninguna cifra.
 */
@Component({
  selector: 'app-calc-scene',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; position: relative; height: 100%; min-height: 3.5rem; overflow: hidden; container-type: inline-size; }
    .scene { position: absolute; inset: 0; }
    .road { position: absolute; left: 0; right: 0; bottom: 14%; height: 2px; overflow: hidden; }
    .road::before { content: ''; position: absolute; inset: 0 -40px 0 0; background: repeating-linear-gradient(90deg, color-mix(in srgb, var(--c-head) 40%, transparent) 0 14px, transparent 14px 28px); }
    .truck { position: absolute; left: 0; bottom: calc(14% + 1px); width: clamp(52px, 9vh, 76px); transform: translateX(calc(50cqw - 50%)); }
    .truck svg { display: block; width: 100%; height: auto; overflow: visible; }
    .body { fill: var(--c-sf); stroke: var(--c-head); stroke-width: 1.5; }
    .cab { fill: color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); stroke: var(--c-head); stroke-width: 1.5; stroke-linejoin: round; }
    .window { fill: var(--c-sf); stroke: var(--c-head); stroke-width: 1; }
    .tire { fill: var(--c-head); }
    .nut { fill: var(--c-primary); }
    .wheel { transform-box: fill-box; transform-origin: center; }
    .puff { position: absolute; top: 4%; right: 78%; width: 7px; height: 7px; border-radius: 50%; background: color-mix(in srgb, var(--c-head) 20%, transparent); opacity: 0; }
    .puff.warm { background: color-mix(in srgb, var(--c-primary) 20%, transparent); }
    .text { position: absolute; top: 6%; right: 10px; font-size: 0.78rem; font-weight: 600; color: var(--c-mu); }
    .motion .truck { animation: drive 1.6s linear infinite; }
    .motion .road::before { animation: road 0.5s linear infinite; }
    .motion .wheel { animation: spin 0.45s linear infinite; }
    .motion .puff { animation: puff 0.9s ease-out infinite; }
    .motion .puff:nth-of-type(2) { animation-delay: 0.3s; }
    .motion .puff:nth-of-type(3) { animation-delay: 0.6s; }
    @keyframes drive { from { transform: translateX(-100%); } to { transform: translateX(100cqw); } }
    @keyframes road { to { transform: translateX(-28px); } }
    @keyframes spin { to { transform: rotate(360deg); } }
    @keyframes puff { 0% { opacity: 0.8; transform: translate(0, 0) scale(0.6); } 100% { opacity: 0; transform: translate(-16px, -10px) scale(1.5); } }
  `],
  template: `
    <div [class.motion]="motion()" class="scene" data-testid="calc-scene" aria-hidden="true">
      <span class="text">Calculando…</span>
      <div class="road"></div>
      <div class="truck">
        <span class="puff"></span><span class="puff warm"></span><span class="puff"></span>
        <svg viewBox="0 0 64 34">
          <rect class="body" x="2" y="3" width="38" height="20" rx="2" />
          <path class="cab" d="M42 9h10l9 8v6H42z" />
          <path class="window" d="M45 11h6l5 5h-11z" />
          <g class="wheel"><circle class="tire" cx="12" cy="26" r="5.5" /><circle class="nut" cx="14" cy="26" r="1.5" /></g>
          <g class="wheel"><circle class="tire" cx="26" cy="26" r="5.5" /><circle class="nut" cx="28" cy="26" r="1.5" /></g>
          <g class="wheel"><circle class="tire" cx="52" cy="26" r="5.5" /><circle class="nut" cx="54" cy="26" r="1.5" /></g>
        </svg>
      </div>
    </div>
  `,
})
export class CalcSceneComponent {
  /** `false` con la preferencia de menos movimiento: sin ninguna animación. */
  readonly motion = input(true);
}
