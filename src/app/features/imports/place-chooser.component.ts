import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { PendingPlace, PlaceCandidate, PlaceCounterpart, PlaceMatch } from '../../domain/models/places';
import { ImportPlacesFacade } from './import-places.facade';
import { formatCount } from './imports.labels';

export const PLACE_NOTE_MAX = 200;

/** Los ids del DOM salen de un contador, no de la clave del lugar (lleva espacios y rompe `aria-labelledby`). */
let nextChooserId = 0;

/** Cómo coincidió el texto con el candidato; el servidor entrega el código, la frase es de la pantalla. */
const MATCH_TEXT: Readonly<Record<PlaceMatch, string>> = {
  EXACT: 'Nombre igual al texto',
  PREFIX: 'El nombre empieza como el texto',
  CONTAINS: 'El nombre contiene el texto',
};

const KM = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

/**
 * Selector de municipio de UN lugar sin resolver: los candidatos que entrega el servidor como grupo de opciones (ninguna marcada de antemano) y la
 * evidencia como dato —los municipios del otro extremo con su distancia del archivo y la ruta de cada candidato—. La pantalla no sugiere ni elige:
 * solo envía lo que la persona marque. Si el envío falla, la selección y la nota se conservan para reintentar.
 */
@Component({
  selector: 'app-place-chooser',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(keydown.escape)': 'onEscape($event)' },
  styles: [
    `
      :host { display: block; }
      form { display: flex; flex-direction: column; gap: 10px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); }
      fieldset { display: flex; flex-direction: column; gap: 6px; margin: 0; padding: 0; border: 0; min-width: 0; }
      legend { padding: 0; margin-bottom: 4px; font-size: 0.88rem; font-weight: 700; color: var(--c-head); }
      legend:focus { outline: none; }
      .cand { display: flex; align-items: flex-start; gap: 10px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 10px; cursor: pointer; background: var(--c-sf); }
      .cand input { margin-top: 3px; flex: none; }
      .cand:has(input:checked) { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary); background: var(--c-s2); }
      .cand:has(input:focus-visible) { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .cand .body { display: flex; flex-direction: column; gap: 2px; min-width: 0; font-size: 0.84rem; color: var(--c-mu); }
      .cand b { font-size: 0.92rem; color: var(--c-head); overflow-wrap: anywhere; }
      .cand ul { margin: 2px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 1px; }
      h4 { margin: 0; font-size: 0.8rem; font-weight: 700; color: var(--c-head); }
      .ev { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 10px; }
      .ev ul { margin: 4px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 2px; font-size: 0.82rem; color: var(--c-mu); }
      .ev li b { color: var(--c-head); }
      label.note { display: flex; flex-direction: column; gap: 4px; font-size: 0.82rem; font-weight: 600; color: var(--c-mu); }
      label.note textarea { font: inherit; font-weight: 400; color: var(--c-head); padding: 6px 8px; border: 1px solid var(--c-bd); border-radius: 8px; background: var(--c-sf); resize: none; }
      label.note textarea:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .scope { margin: 0; font-size: 0.82rem; color: var(--c-text); }
      .actions { display: flex; flex-wrap: wrap; gap: 8px; }
      .actions button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .err { margin: 0; font-size: 0.86rem; font-weight: 600; color: var(--c-danger); }
      .none { margin: 0; font-size: 0.86rem; color: var(--c-mu); }
    `,
  ],
  template: `
    @if (place().candidates.length === 0) {
      <p class="none" data-testid="chooser-empty">No hay municipios oficiales que coincidan con este texto, así que no hay nada que elegir. Corrige el nombre en tu archivo y vuelve a cargarlo.</p>
    } @else {
      <form (submit)="$event.preventDefault(); submit()" [attr.aria-labelledby]="uid + '-title'" data-testid="chooser">
        <fieldset role="radiogroup" [attr.aria-describedby]="uid + '-scope'">
          <legend [id]="uid + '-title'" tabindex="-1" #title>¿Qué municipio es «{{ place().placeText }}»?</legend>
          @for (c of place().candidates; track c.code) {
            <label class="cand" [attr.data-testid]="'candidate-' + c.code">
              <input type="radio" [name]="'place-' + place().placeKey" [value]="c.code" [checked]="selectedCandidate()?.code === c.code" (change)="selected.set(c.code)" />
              <span class="body">
                <b>{{ c.name }}<span class="sr-only">. </span></b>
                <span>{{ c.department }}<span aria-hidden="true"> · </span><span class="sr-only">, código </span>{{ c.code }}</span>
                <span>{{ matchText(c) }}@if (c.kind === 'CENTRO_POBLADO') {<span aria-hidden="true"> · </span><span class="sr-only">. </span>Centro poblado «{{ c.matchedName }}»}@if (!c.inDepartment) {<span aria-hidden="true"> · </span><span class="sr-only">. </span>En otro departamento}</span>
                @if (c.routes.length > 0) {
                  <ul [attr.aria-label]="'Distancia por ruta de ' + c.name" [attr.data-testid]="'routes-' + c.code">
                    @for (r of c.routes; track r.counterpartCode) {
                      <li>Ruta a {{ counterpartName(r.counterpartCode) }}: <b>{{ r.km === null ? 'sin ruta guardada' : km(r.km) + ' km' }}</b></li>
                    }
                  </ul>
                }
              </span>
            </label>
          }
        </fieldset>

        @if (origins().length > 0 || destinations().length > 0) {
          <div class="ev" data-testid="chooser-evidence">
            @if (origins().length > 0) {
              <div>
                <h4>Viajes que salen de este lugar hacia</h4>
                <ul>@for (o of origins(); track o.code) { <li><b>{{ o.name }}</b>, {{ o.department }}<span aria-hidden="true"> · </span><span class="sr-only">. </span>{{ trips(o.trips) }}<span aria-hidden="true"> · </span><span class="sr-only">. </span>{{ fileDistance(o) }}</li> }</ul>
              </div>
            }
            @if (destinations().length > 0) {
              <div>
                <h4>Viajes que llegan a este lugar desde</h4>
                <ul>@for (o of destinations(); track o.code) { <li><b>{{ o.name }}</b>, {{ o.department }}<span aria-hidden="true"> · </span><span class="sr-only">. </span>{{ trips(o.trips) }}<span aria-hidden="true"> · </span><span class="sr-only">. </span>{{ fileDistance(o) }}</li> }</ul>
              </div>
            }
          </div>
        }

        <label class="note">Nota (opcional)
          <textarea rows="2" [attr.maxlength]="noteMax" data-testid="chooser-note" [value]="note()" (input)="note.set($any($event.target).value)"></textarea>
        </label>

        <p class="scope" [id]="uid + '-scope'" data-testid="chooser-scope">Tu elección vale para toda tu empresa: cada vez que aparezca este texto se usará este municipio. Puedes deshacerla en Configuración.</p>

        <div class="actions">
          <button type="submit" class="btn btn-primary btn-sm" data-testid="chooser-submit" [disabled]="!selectedCandidate() || facade.busy() !== null" [attr.aria-busy]="busy()">{{ busy() ? 'Guardando…' : 'Elegir este municipio' }}</button>
          <button type="button" class="btn btn-secondary btn-sm" data-testid="chooser-cancel" [disabled]="busy()" (click)="closed.emit()">Cancelar</button>
        </div>

        <div aria-live="polite">
          @if (failure(); as e) { <p class="err" role="alert" data-testid="chooser-error">{{ e.message }}@if (e.code === 'COMPANY_BUSY') { Tu elección se conserva: vuelve a pulsar «Elegir este municipio». }</p> }
        </div>
      </form>
    }
  `,
})
export class PlaceChooserComponent {
  protected readonly facade = inject(ImportPlacesFacade);

  readonly importId = input.required<string>();
  readonly place = input.required<PendingPlace>();
  readonly closed = output();

  private readonly title = viewChild<ElementRef<HTMLElement>>('title');

  protected readonly uid = `place-chooser-${nextChooserId++}`;
  protected readonly noteMax = PLACE_NOTE_MAX;
  protected readonly selected = signal<string | null>(null);
  /** La opción marcada solo vale mientras el servidor la siga ofreciendo: si una recarga la quita, no se envía. */
  protected readonly selectedCandidate = computed(() => this.place().candidates.find((c) => c.code === this.selected()) ?? null);
  protected readonly note = signal('');
  protected readonly km = (value: number): string => KM.format(value);
  protected readonly busy = computed(() => this.facade.busy() === this.place().placeKey);
  protected readonly failure = computed(() => {
    const failed = this.facade.error();

    return failed && failed.placeKey === this.place().placeKey ? failed.error : null;
  });
  protected readonly origins = computed(() => this.place().counterpartsAsOrigin);
  protected readonly destinations = computed(() => this.place().counterpartsAsDestination);

  constructor() {
    // Al abrirse el foco va al título del grupo: quien usa lector de pantalla oye la pregunta y recorre las opciones.
    afterNextRender(() => this.title()?.nativeElement.focus());
  }

  protected matchText(candidate: PlaceCandidate): string {
    return MATCH_TEXT[candidate.match];
  }

  protected trips(count: number): string {
    return `${formatCount(count)} ${count === 1 ? 'viaje' : 'viajes'}`;
  }

  protected fileDistance(item: PlaceCounterpart): string {
    if (item.avgFileDistanceKm === null || item.tripsWithFileDistance === 0) return 'el archivo no trae distancia';

    return `el archivo dice ${KM.format(item.avgFileDistanceKm)} km en promedio (${this.trips(item.tripsWithFileDistance)})`;
  }

  protected counterpartName(code: string): string {
    const found = [...this.origins(), ...this.destinations()].find((c) => c.code === code);

    return found ? found.name : code;
  }

  protected submit(): void {
    const candidate = this.selectedCandidate();

    if (!candidate) return;

    this.facade.choose(
      { importId: this.importId(), placeKey: this.place().placeKey, placeText: this.place().placeText, municipalityCode: candidate.code, note: this.note().trim() || null, scope: 'IMPORT' },
      () => this.closed.emit(),
    );
  }

  protected onEscape(event: Event): void {
    if (this.busy()) return;

    // Escape cierra solo el selector, no la revisión que lo contiene.
    event.preventDefault();
    event.stopPropagation();
    this.closed.emit();
  }
}
