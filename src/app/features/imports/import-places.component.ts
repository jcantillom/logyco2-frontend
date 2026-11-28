import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { PendingPlace, PlaceResolution } from '../../domain/models/places';
import { ImportPlacesFacade, PlaceOutcome } from './import-places.facade';
import { formatCount } from './imports.labels';
import { PlaceChooserComponent } from './place-chooser.component';

/** Lugares por página: la lista nunca crece sin tope ni lleva scroll propio. */
export const PLACES_PAGE_SIZE = 6;

/**
 * «Lugares por confirmar» de la revisión: los textos de lugar del archivo que la plataforma no puede reconocer sola (ambiguos o desconocidos). Nunca
 * elige: quien tiene `imports:create` abre el selector de cada texto y decide qué municipio oficial significa para su empresa; los demás lo ven como
 * información. Todas las cifras y textos de resultado son del servidor.
 */
@Component({
  selector: 'app-import-places',
  imports: [PlaceChooserComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      section { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      section.alert-box { border-color: color-mix(in srgb, var(--c-accent) 40%, var(--c-bd)); }
      h3 { margin: 0; font-size: 0.72rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      p { margin: 0; font-size: 0.9rem; color: var(--c-text); }
      p.small { font-size: 0.82rem; color: var(--c-mu); }
      ul.places { margin: 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 6px; }
      ul.places > li { display: flex; flex-direction: column; gap: 6px; padding: 8px 10px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); }
      .row { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; }
      .row .what { display: flex; flex-direction: column; min-width: 0; }
      .row b { font-size: 0.92rem; color: var(--c-head); overflow-wrap: anywhere; }
      .row .why { font-size: 0.8rem; color: var(--c-mu); }
      .row button:focus-visible, .pg button:focus-visible, .outcome button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .pg { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 0.78rem; color: var(--c-mu); }
      .outcomes { display: flex; flex-direction: column; gap: 6px; }
      .outcomes:focus { outline: none; }
      .outcome { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; color: var(--c-success); font-weight: 600; font-size: 0.88rem; }
      .outcome p { color: inherit; font-size: inherit; }
      .err { color: var(--c-danger); font-weight: 600; font-size: 0.86rem; }
    `,
  ],
  template: `
    @if (visible()) {
      <section [class.alert-box]="canChoose() && places().length > 0" aria-labelledby="pl-title" data-testid="places">
        <h3 id="pl-title">Lugares por confirmar</h3>

        @if (places().length > 0) {
          <p data-testid="places-summary">{{ summary() }}</p>
          <p class="small" data-testid="places-scope">No elegimos por ti. Lo que elijas vale para toda tu empresa y puedes deshacerlo en Configuración.</p>
          @if (resolution().truncated) { <p class="small" data-testid="places-truncated">Se muestran los {{ count(places().length) }} lugares con más viajes.</p> }
          @if (!canChoose()) { <p class="small" data-testid="places-readonly">Quien tiene permiso para cargar información puede elegir estos lugares.</p> }

          <ul class="places" aria-label="Lugares por confirmar" data-testid="places-list">
            @for (p of pageItems(); track p.placeKey) {
              <li [attr.data-testid]="'place-' + p.placeKey">
                <div class="row">
                  <span class="what"><b>{{ p.placeText }}</b><span class="why">{{ p.reasonLabel }}<span aria-hidden="true"> · </span><span class="sr-only">. </span>{{ tripsText(p.trips) }}</span></span>
                  @if (canChoose() && p.candidates.length > 0) {
                    <button type="button" class="btn btn-secondary btn-sm" [attr.data-place-toggle]="p.placeKey" data-testid="place-toggle" [attr.aria-expanded]="openKey() === p.placeKey" (click)="toggle(p)">{{ openKey() === p.placeKey ? 'Cerrar' : 'Elegir municipio' }}</button>
                  }
                </div>
                @if (p.choice; as c) {
                  <p class="small" data-testid="place-already">Tu empresa ya eligió {{ c.municipalityName }} ({{ c.department }}) para este texto, pero faltan {{ tripsText(p.pendingTrips) }} de otras cargas.</p>
                  @if (canChoose()) {
                    <div><button type="button" class="btn btn-secondary btn-sm" data-testid="place-apply-company" [disabled]="facade.busy() !== null" (click)="applyToCompany(c.placeText, c.municipalityCode, c.note, p.placeKey)">Aplicar a toda la empresa</button></div>
                  }
                } @else if (p.candidates.length === 0) {
                  <p class="small" data-testid="place-no-candidates">No hay municipios oficiales que coincidan con este texto. Corrige el nombre en tu archivo y vuelve a cargarlo.</p>
                }
                @if (openKey() === p.placeKey) { <app-place-chooser [importId]="importId()" [place]="p" (closed)="close(p.placeKey)" /> }
                @if (companyError(p.placeKey); as e) { <p class="err" role="alert" data-testid="place-error">{{ e }}</p> }
              </li>
            }
          </ul>

          @if (pages() > 1) {
            <nav class="pg" aria-label="Páginas de los lugares">
              <button type="button" class="btn btn-secondary btn-sm" data-testid="places-prev" [disabled]="current() === 0" (click)="goTo(current() - 1)">Anterior</button>
              <span role="status">Página {{ current() + 1 }} de {{ pages() }}</span>
              <button type="button" class="btn btn-secondary btn-sm" data-testid="places-next" [disabled]="current() + 1 >= pages()" (click)="goTo(current() + 1)">Siguiente</button>
            </nav>
          }
        }

        @if (resolution().reprocessHint.places > 0) {
          <p class="small" data-testid="places-reprocess">{{ hint() }}</p>
        }

        <div class="outcomes" aria-live="polite" tabindex="-1" #outcomesBox data-testid="places-outcomes">
          @for (o of outcomes(); track o.placeKey) {
            <div class="outcome" [attr.data-testid]="'outcome-' + o.placeKey">
              <p role="status">{{ outcomeText(o) }}</p>
              @if (canChoose() && o.result.otherTripsPending > 0) {
                <button type="button" class="btn btn-secondary btn-sm" data-testid="outcome-apply-company" [disabled]="facade.busy() !== null" (click)="applyToCompany(o.result.choice.placeText, o.result.choice.municipalityCode, o.result.choice.note, o.placeKey)">Aplicar a toda la empresa</button>
              }
            </div>
          }
        </div>
      </section>
    }
  `,
})
export class ImportPlacesComponent {
  protected readonly facade = inject(ImportPlacesFacade);
  private readonly access = inject(AccessPolicy);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly importId = input.required<string>();
  readonly resolution = input.required<PlaceResolution>();

  protected readonly count = formatCount;
  protected readonly page = signal(0);
  protected readonly openKey = signal<string | null>(null);

  protected readonly canChoose = computed(() => this.access.can('imports:create'));
  protected readonly places = computed(() => this.resolution().pending);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.places().length / PLACES_PAGE_SIZE)));
  /** Si la lista se acorta tras decidir, la página nunca queda fuera de rango. */
  protected readonly current = computed(() => Math.min(this.page(), this.pages() - 1));
  protected readonly pageItems = computed(() => this.places().slice(this.current() * PLACES_PAGE_SIZE, (this.current() + 1) * PLACES_PAGE_SIZE));
  protected readonly outcomes = computed(() => this.facade.outcomes().filter((o) => o.importId === this.importId()));
  /** El bloque se queda mientras haya un resultado que contar, aunque ya no queden lugares por confirmar. */
  protected readonly visible = computed(() => this.places().length > 0 || this.outcomes().length > 0);

  protected readonly summary = computed(() => {
    const r = this.resolution();

    return `${formatCount(r.pendingPlaces)} ${r.pendingPlaces === 1 ? 'lugar del archivo no se pudo reconocer' : 'lugares del archivo no se pudieron reconocer'} (${this.tripsText(r.pendingTrips)}). Hasta que se confirmen, esos viajes no tienen municipio.`;
  });

  protected readonly hint = computed(() => {
    const { places, trips } = this.resolution().reprocessHint;

    return `${formatCount(places)} ${places === 1 ? 'lugar guardado sin municipio ya lo reconoce' : 'lugares guardados sin municipio ya los reconoce'} la plataforma (${this.tripsText(trips)}): reprocesar la carga ${places === 1 ? 'lo completa' : 'los completa'}.`;
  });

  protected tripsText(count: number): string {
    return `${formatCount(count)} ${count === 1 ? 'viaje' : 'viajes'}`;
  }

  protected goTo(page: number): void {
    this.page.set(Math.max(0, Math.min(page, this.pages() - 1)));
    this.openKey.set(null);
  }

  protected toggle(place: PendingPlace): void {
    this.openKey.set(this.openKey() === place.placeKey ? null : place.placeKey);
  }

  /** Cierra el selector y devuelve el foco al botón que lo abrió (si el lugar sigue en la lista). */
  protected close(placeKey: string): void {
    this.openKey.set(null);
    queueMicrotask(() => {
      const toggle = this.host.nativeElement.querySelector<HTMLElement>(`[data-place-toggle="${CSS.escape(placeKey)}"]`);

      (toggle ?? this.host.nativeElement.querySelector<HTMLElement>('[data-testid="places-outcomes"]'))?.focus();
    });
  }

  /** Repite la misma decisión sin acotarla a esta carga: el servidor la aplica a los viajes de todas las cargas de la empresa. */
  protected applyToCompany(placeText: string, municipalityCode: string, note: string | null, placeKey: string): void {
    this.facade.choose({ importId: this.importId(), placeKey, placeText, municipalityCode, note, scope: 'COMPANY' });
  }

  protected companyError(placeKey: string): string | null {
    const failed = this.facade.error();

    return failed && failed.placeKey === placeKey && this.openKey() !== placeKey ? failed.error.message : null;
  }

  protected outcomeText(o: PlaceOutcome): string {
    const { result } = o;
    const name = `«${result.choice.placeText}»`;

    if (!result.changed && result.tripsUpdated === 0) return `${name}: sin cambios. Ya estaba elegido ${result.choice.municipalityName} para toda tu empresa.`;

    const parts = [
      `${name} quedó como ${result.choice.municipalityName} (${result.choice.department}) para toda tu empresa.`,
      `${this.tripsText(result.tripsUpdated)} ${result.tripsUpdated === 1 ? 'actualizado' : 'actualizados'}`,
      `${formatCount(result.nowCalculated)} ${result.nowCalculated === 1 ? 'ahora calculado' : 'ahora calculados'}`,
      `${formatCount(result.stillPending)} ${result.stillPending === 1 ? 'sigue pendiente' : 'siguen pendientes'}.`,
    ];
    const other = result.otherTripsPending > 0 ? ` ${this.tripsText(result.otherTripsPending)} de otras cargas con este texto siguen sin municipio.` : '';

    return `${parts[0]} ${parts[1]} · ${parts[2]} · ${parts[3]}${other}`;
  }
}
