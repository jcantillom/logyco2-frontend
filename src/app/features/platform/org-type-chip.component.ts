import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

const ICONS = {
  truck: 'M2 6h11v10H2zM13 9h4.5l3.5 3.5V16h-8zM4.2 18.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0M15.2 18.5a1.8 1.8 0 1 0 3.6 0 1.8 1.8 0 1 0-3.6 0',
  box: 'M21 8l-9-5-9 5v8l9 5 9-5zM3 8l9 5 9-5M12 13v8',
} as const;

/** Tipo de empresa como chip con ícono: caja para «Generador de carga» (`SHIPPER`), camión para el resto (`CARRIER`). */
@Component({
  selector: 'app-org-type-chip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: inline-flex; max-width: 100%; }
      .tbadge { display: inline-flex; align-items: center; gap: 8px; max-width: 100%; padding: 3px 12px 3px 3px; border-radius: 999px; background: var(--c-ok-soft); color: var(--c-accent); font-size: 0.82rem; font-weight: 700; line-height: 1.3; white-space: normal; overflow-wrap: anywhere; }
      .tbadge svg { box-sizing: border-box; width: 22px; height: 22px; flex: none; padding: 5px; border-radius: 50%; background: var(--c-primary); color: var(--c-sf); fill: none; stroke: currentColor; stroke-width: 1.9; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `<span class="tbadge"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="path()" /></svg>{{ type().name }}</span>`,
})
export class OrgTypeChipComponent {
  readonly type = input.required<{ readonly code: string; readonly name: string }>();

  protected readonly path = computed(() => (this.type().code === 'SHIPPER' ? ICONS.box : ICONS.truck));
}
