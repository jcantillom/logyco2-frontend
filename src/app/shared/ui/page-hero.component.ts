import { ChangeDetectionStrategy, Component, input } from '@angular/core';

/** Cabecera de las vistas de la empresa: título, subtítulo y el paisaje con el camión a la derecha (sangra a la izquierda, no a la derecha). */
@Component({
  selector: 'app-page-hero',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.dense]': 'dense()', '[class.plain]': '!art()' },
  styles: [
    `
      :host { display: block; }
      .hero { position: relative; isolation: isolate; display: flex; align-items: center; justify-content: space-between; gap: 16px; min-height: 120px; margin: -22px 0 0 -28px; padding: 22px 0 8px 28px; overflow: hidden; background: linear-gradient(90deg, transparent 38%, var(--c-ok-soft) 100%); }
      h1 { margin: 0 0 4px; font-size: clamp(1.7rem, 2.4vw, 2.2rem); letter-spacing: -0.04em; color: var(--c-head); }
      p { margin: 0; color: var(--c-mu); font-size: 0.98rem; max-width: 780px; }
      .art { flex: none; align-self: flex-end; width: min(560px, 48%); height: auto; margin-bottom: -2px; -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 14%), linear-gradient(0deg, transparent 0, #000 8%); -webkit-mask-composite: source-in; mask-image: linear-gradient(90deg, transparent 0, #000 14%), linear-gradient(0deg, transparent 0, #000 8%); mask-composite: intersect; }
      :host(.dense) .hero { min-height: 56px; padding-top: 8px; padding-bottom: 2px; margin-top: -16px; }
      :host(.dense) h1 { margin-bottom: 2px; font-size: clamp(1.5rem, 2vw, 1.8rem); }
      :host(.dense) p { font-size: 0.9rem; }
      :host(.dense) .art { display: none; position: absolute; right: 0; bottom: 0; z-index: -1; width: auto; height: 56px; opacity: 0.8; }
      :host(.plain) .hero { background: none; }
      @media (min-width: 1480px) { :host(.dense) .art { display: block; } }
      @media (max-width: 1100px) { .art { display: none; } .hero { margin: -16px 0 0 -14px; padding-left: 14px; background: none; } }
    `,
  ],
  template: `
    <header class="hero">
      <div>
        <h1>{{ title() }}</h1>
        <p>{{ subtitle() }}</p>
      </div>
      @if (art()) {
      <img class="art" src="/brand/resumen-paisaje.webp" width="551" height="96" decoding="async" alt="" aria-hidden="true" />
      }
    </header>
  `,
})
export class PageHeroComponent {
  readonly title = input.required<string>();
  readonly subtitle = input('');
  /** Versión baja (≈ 72 px) para vistas que deben caber sin scroll de página. */
  readonly dense = input(false);
  /** Sin el paisaje con el camión ni su fondo: encabezado de solo texto. */
  readonly art = input(true);
}
