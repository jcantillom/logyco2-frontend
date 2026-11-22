import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CardHeadComponent } from './card-head.component';
import { GlyphComponent } from './glyph.component';

const CONCEPTS: readonly { question: string; answer: string }[] = [
  { question: '¿Qué es el rendimiento del vehículo?', answer: 'Es la distancia que recorre el vehículo con un galón de combustible, en kilómetros por galón (km/gal). Entre más alto, menos combustible gasta.' },
  { question: '¿Qué es el peso bruto vehicular (PBV)?', answer: 'Es el peso máximo del vehículo más su carga. No es la capacidad de carga útil: a ese peso hay que restarle el del propio vehículo.' },
  { question: '¿Qué significa kg CO₂/gal?', answer: 'Son los kilogramos de CO₂ que se emiten al quemar un galón de combustible. Multiplicado por los galones consumidos da las emisiones. Con gas natural la unidad es kg CO₂/m³.' },
];

/** Tarjeta «Conceptos clave»: tres respuestas breves en un acordeón nativo (accesible con teclado). */
@Component({
  selector: 'app-key-concepts',
  imports: [CardHeadComponent, GlyphComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    :host { display: block; min-width: 0; }
    section { display: flex; flex-direction: column; height: 100%; padding: clamp(10px, 1.6vh, 16px) clamp(12px, 1.3vw, 18px); border-radius: 16px; }
    .list { flex: 1 1 auto; justify-content: space-around; display: flex; flex-direction: column; gap: clamp(5px, 1.4vh, 14px); margin-top: clamp(6px, 1.6vh, 16px); }
    details { position: relative; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); }
    summary { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: clamp(7px, 1.6vh, 16px) 14px; font-weight: 600; font-size: 0.9rem; color: var(--c-head); cursor: pointer; list-style: none; }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { border-radius: 10px; }
    summary app-glyph { font-size: 18px; color: var(--c-mu); transition: transform 0.15s; }
    details[open] { border-color: var(--c-primary-400); }
    details[open] summary app-glyph { transform: rotate(180deg); }
    p { margin: 0; padding: 0 14px 12px; font-size: 0.86rem; color: var(--c-mu); }
    /* Con el tablero a pantalla completa la respuesta abierta se superpone (no empuja las filas) y, si es larga, se desplaza por dentro. */
    @media (min-width: 1200px) and (min-height: 700px) {
      details[open] p { position: absolute; z-index: 5; top: calc(100% + 4px); left: 0; right: 0; max-height: 9em; overflow-y: auto; padding: 10px 14px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); box-shadow: var(--shadow); }
    }
    @media (prefers-reduced-motion: reduce) { summary app-glyph { transition: none; } }
  `],
  template: `
    <section class="card" aria-labelledby="concepts-title" data-testid="section-concepts">
      <app-card-head icon="book" titleId="concepts-title" title="Conceptos clave" />
      <div class="list">
        @for (c of concepts; track c.question) {
          <details name="key-concepts" data-testid="concept">
            <summary>{{ c.question }}<app-glyph name="chevronDown" /></summary>
            <p>{{ c.answer }}</p>
          </details>
        }
      </div>
    </section>
  `,
})
export class KeyConceptsComponent {
  protected readonly concepts = CONCEPTS;
}
