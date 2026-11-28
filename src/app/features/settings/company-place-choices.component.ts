import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlaceChoice } from '../../domain/models/places';
import { formatCount } from '../imports/imports.labels';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { CompanyPlaceChoicesFacade, PLACE_CHOICES_LIMIT } from './company-place-choices.facade';

/** Elecciones por página: la lista nunca crece sin tope ni lleva scroll propio. */
export const CHOICES_PAGE_SIZE = 6;

/**
 * «Lugares de tu empresa»: lo que la empresa eligió para los textos de lugar ambiguos (texto → municipio, quién y cuándo) con «Deshacer». Deshacer
 * vale para toda la empresa, así que pide confirmación antes de enviar nada. La pantalla muestra lo que responde el servidor; no elige ni recalcula.
 */
@Component({
  selector: 'app-company-place-choices',
  imports: [DatePipe, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .counter { margin: 10px 0 0; font-size: 0.84rem; color: var(--c-mu); }
      .counter b { color: var(--c-head); font-variant-numeric: tabular-nums; }
      ul.choices { margin: 10px 0 0; padding: 0; list-style: none; display: flex; flex-direction: column; gap: 8px; }
      ul.choices > li { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: center; gap: 4px 12px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: var(--radius); }
      .what { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
      .what b { color: var(--c-head); overflow-wrap: anywhere; }
      .what .to { font-size: 0.9rem; color: var(--c-text); }
      .what small { font-size: 0.8rem; color: var(--c-mu); overflow-wrap: anywhere; }
      li button:focus-visible, .pg button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .pg { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 8px; font-size: 0.78rem; color: var(--c-mu); }
      .hint { color: var(--c-mu); font-size: 0.84rem; margin: 10px 0 0; }
      [aria-live]:focus { outline: none; }
      .done { color: var(--c-success); font-weight: 600; font-size: 0.86rem; margin: 10px 0 0; }
      .err { color: var(--c-danger); font-weight: 600; font-size: 0.86rem; margin: 10px 0 0; }
      @media (max-width: 640px) { ul.choices > li { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <app-resource-state [status]="facade.choices.status()" [error]="facade.choices.error()" (retry)="facade.load()">
      @if (facade.choices.data(); as all) {
        <div data-testid="place-choices">
          <p class="counter" data-testid="place-choices-counter"><b>{{ count(all.length) }}</b> de {{ count(limit) }} lugares elegidos</p>

          @if (all.length === 0) {
            <p class="hint" data-testid="place-choices-empty">Tu empresa aún no ha elegido ningún lugar. Aparecen aquí cuando confirmas uno en la revisión de una carga.</p>
          } @else {
            <ul class="choices" aria-label="Lugares elegidos por tu empresa">
              @for (c of pageItems(); track c.id) {
                <li [attr.data-testid]="'choice-' + c.id">
                  <div class="what">
                    <b>{{ c.placeText }}</b>
                    <span class="to"><span class="sr-only">Municipio elegido: </span>{{ c.municipalityName }}<span aria-hidden="true"> · </span><span class="sr-only">, </span>{{ c.department }}<span aria-hidden="true"> · </span><span class="sr-only">, código </span>{{ c.municipalityCode }}</span>
                    <small>{{ who(c) }}<span aria-hidden="true"> · </span><span class="sr-only">. </span><time [attr.datetime]="c.chosenAt">{{ c.chosenAt | date: 'd MMM y, HH:mm' }}</time></small>
                    @if (c.note; as note) { <small data-testid="choice-note">Nota: {{ note }}</small> }
                  </div>
                  <button type="button" class="btn btn-secondary btn-sm" data-testid="choice-undo" [disabled]="facade.busy() !== null" [attr.aria-busy]="facade.busy() === c.id" [attr.aria-label]="'Deshacer la elección de ' + c.placeText" (click)="undo(c)">{{ facade.busy() === c.id ? 'Deshaciendo…' : 'Deshacer' }}</button>
                </li>
              }
            </ul>
            @if (pages() > 1) {
              <nav class="pg" aria-label="Páginas de los lugares elegidos">
                <button type="button" class="btn btn-secondary btn-sm" data-testid="choices-prev" [disabled]="current() === 0" (click)="page.set(current() - 1)">Anterior</button>
                <span role="status">Página {{ current() + 1 }} de {{ pages() }}</span>
                <button type="button" class="btn btn-secondary btn-sm" data-testid="choices-next" [disabled]="current() + 1 >= pages()" (click)="page.set(current() + 1)">Siguiente</button>
              </nav>
            }
          }

          <div aria-live="polite" tabindex="-1" #outcomeBox data-testid="choices-outcome">
            @if (facade.outcome(); as o) {
              <p class="done" role="status" data-testid="choices-undone">{{ undoneText() }}</p>
            }
            @if (facade.error(); as e) { <p class="err" role="alert" data-testid="choices-error">{{ e.message }}</p> }
          </div>
        </div>
      }
    </app-resource-state>
  `,
})
export class CompanyPlaceChoicesComponent {
  protected readonly facade = inject(CompanyPlaceChoicesFacade);
  private readonly confirm = inject(ConfirmService);
  private readonly session = inject(SessionStore);
  private readonly outcomeBox = viewChild<ElementRef<HTMLElement>>('outcomeBox');

  protected readonly count = formatCount;
  protected readonly limit = PLACE_CHOICES_LIMIT;
  protected readonly page = signal(0);

  private readonly items = computed(() => this.facade.choices.data() ?? []);
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.items().length / CHOICES_PAGE_SIZE)));
  /** Si la lista se acorta tras deshacer, la página nunca queda fuera de rango. */
  protected readonly current = computed(() => Math.min(this.page(), this.pages() - 1));
  protected readonly pageItems = computed(() => this.items().slice(this.current() * CHOICES_PAGE_SIZE, (this.current() + 1) * CHOICES_PAGE_SIZE));

  protected readonly undoneText = computed(() => {
    const o = this.facade.outcome();

    if (!o) return '';

    const { tripsReverted, tripsRecalculated } = o.result;

    return `Deshecho: «${o.choice.placeText}» ya no significa ${o.choice.municipalityName}. ${formatCount(tripsReverted)} ${tripsReverted === 1 ? 'viaje volvió' : 'viajes volvieron'} a quedar sin municipio y ${formatCount(tripsRecalculated)} se ${tripsRecalculated === 1 ? 'volvió' : 'volvieron'} a evaluar.`;
  });

  constructor() {
    this.facade.load();
  }

  /** El servidor guarda solo quién eligió (su identificador): se distingue a la persona actual y a quien ya no existe; no se inventa un nombre. */
  protected who(choice: PlaceChoice): string {
    if (choice.chosenBy === null) return 'Elegido por una persona que ya no está';

    return choice.chosenBy === this.session.user()?.id ? 'Elegido por ti' : 'Elegido por otra persona de tu empresa';
  }

  protected async undo(choice: PlaceChoice): Promise<void> {
    const accepted = await this.confirm.confirm({
      title: 'Deshacer esta elección',
      message: `«${choice.placeText}» dejará de significar ${choice.municipalityName} para toda tu empresa. Los viajes guardados con esta elección volverán a quedar sin municipio, y sin la distancia que salió de la ruta, hasta que elijas otro. Puedes volver a elegir cuando quieras.`,
      confirmLabel: 'Deshacer',
      danger: true,
    });

    if (!accepted) return;

    // La fila desaparece al deshacer: el foco pasa a la región de resultado para no perderse.
    this.facade.undo(choice, () => queueMicrotask(() => this.outcomeBox()?.nativeElement.focus()));
  }
}
