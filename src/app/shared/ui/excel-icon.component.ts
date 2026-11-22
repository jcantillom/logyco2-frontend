import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Ícono plano de una hoja de cálculo de Excel (página con cuadrícula y una «X» marcada) dentro de un recuadro redondeado de aguamarina de marca. Decorativo. */
@Component({
  selector: 'app-excel-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: inline-grid; place-items: center; flex: none; background: color-mix(in srgb, var(--c-secondary) 20%, var(--c-sf)); color: var(--c-head); }
      svg { width: 66%; height: 66%; }
      .page { fill: var(--c-sf); stroke: currentColor; stroke-width: 1.5; stroke-linejoin: round; }
      .grid { fill: none; stroke: currentColor; stroke-width: 1.2; stroke-linecap: round; }
      .tab { fill: var(--c-secondary); }
      .x { fill: none; stroke: var(--c-sf); stroke-width: 2; stroke-linecap: round; }
    `,
  ],
  host: { '[style.width.px]': 'size()', '[style.height.px]': 'size()', '[style.border-radius.px]': 'size() * 0.35', 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24" focusable="false" data-testid="excel-svg">
      <path class="page" d="M14.5 3H9a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7.5zM14.5 3v4.5H19" />
      <path class="grid" d="M12.5 12.5H17M12.5 16H17M14.8 10.5V19" />
      <rect class="tab" x="2" y="9.5" width="10" height="10" rx="2" />
      <path class="x" d="M5.2 12.7l3.6 4.6M8.8 12.7l-3.6 4.6" />
    </svg>
  `,
})
export class ExcelIconComponent {
  /** Lado del recuadro, en píxeles. */
  readonly size = input(34);
}
