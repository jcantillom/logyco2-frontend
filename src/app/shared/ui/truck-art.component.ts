import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Dibujo plano del camión de carga (decorativo). Las ruedas giran con `spinning`, salvo con la preferencia de menos movimiento. */
@Component({
  selector: 'app-truck-art',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg { display: block; width: 100%; height: auto; overflow: visible; }
      .body { fill: var(--c-sf); stroke: var(--c-head); stroke-width: 1.5; }
      .stripe { fill: var(--c-primary); }
      .cab { fill: var(--c-primary); stroke: var(--c-head); stroke-width: 1.5; stroke-linejoin: round; }
      .window { fill: var(--c-sf); stroke: var(--c-head); stroke-width: 1; }
      .tire { fill: var(--c-head); }
      .nut { fill: var(--c-sf); }
      .wheel { transform-box: fill-box; transform-origin: center; }
      .spinning .wheel { animation: spin 0.5s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) { .spinning .wheel { animation: none; } }
    `,
  ],
  template: `
    <svg viewBox="0 0 64 34" aria-hidden="true" [class.spinning]="spinning()">
      <rect class="body" x="2" y="3" width="38" height="20" rx="2" />
      <rect class="stripe" x="2" y="16" width="38" height="3" />
      <path class="cab" d="M42 9h10l9 8v6H42z" />
      <path class="window" d="M45 11h6l5 5h-11z" />
      <g class="wheel"><circle class="tire" cx="12" cy="26" r="5.5" /><circle class="nut" cx="14" cy="26" r="1.4" /></g>
      <g class="wheel"><circle class="tire" cx="26" cy="26" r="5.5" /><circle class="nut" cx="28" cy="26" r="1.4" /></g>
      <g class="wheel"><circle class="tire" cx="52" cy="26" r="5.5" /><circle class="nut" cx="54" cy="26" r="1.4" /></g>
    </svg>
  `,
})
export class TruckArtComponent {
  readonly spinning = input(false);
}
