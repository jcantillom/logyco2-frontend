import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { IconName } from './emissions.icons';
import { GlyphComponent } from './glyph.component';

/** Cabecera de las tarjetas de la guía: icono en cuadro de acento, título, subtítulo y, a la derecha, lo que se proyecte (p. ej. un botón). */
@Component({
  selector: 'app-card-head',
  imports: [GlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: flex; align-items: center; gap: clamp(8px, 1vw, 12px); }
    .ico { display: grid; place-items: center; width: clamp(32px, 4.4vh, 40px); height: clamp(32px, 4.4vh, 40px); border-radius: 10px; background: color-mix(in srgb, var(--c-primary) 20%, var(--c-sf)); color: var(--c-primary); font-size: clamp(18px, 2.6vh, 22px); flex: none; }
    .text { flex: 1; min-width: 0; }
    h2 { margin: 0; font-weight: 700; font-size: clamp(0.98rem, 1.05vw + 0.3vh, 1.1rem); line-height: 1.25; color: var(--c-head); letter-spacing: -0.01em; }
    p { margin: 1px 0 0; font-size: 0.8rem; line-height: 1.3; color: var(--c-mu); }
    .extra { flex: none; }
  `],
  template: `
    <span class="ico"><app-glyph [name]="icon()" /></span>
    <div class="text">
      <h2 [id]="titleId()">{{ title() }}</h2>
      @if (subtitle()) { <p>{{ subtitle() }}</p> }
    </div>
    <div class="extra"><ng-content /></div>
  `,
})
export class CardHeadComponent {
  readonly icon = input.required<IconName>();
  readonly title = input.required<string>();
  readonly subtitle = input('');
  readonly titleId = input<string | null>(null);
}
