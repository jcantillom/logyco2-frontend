import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, input, output, signal, viewChild } from '@angular/core';
import { CodeGuide, FreightVehicle, VehicleFamily, VehicleRegulation } from '../../domain/models/emissions';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { axlesLabel, formatKg, pbvMax, safeHttpUrl } from './emissions.format';
import { VehicleDiagramComponent } from '../../shared/ui/vehicle-diagram/vehicle-diagram.component';

type FamilyFilter = 'ALL' | VehicleFamily;

const FILTERS: readonly { value: FamilyFilter; label: string }[] = [
  { value: 'ALL', label: 'Todos' },
  { value: 'RIGID', label: 'Camiones rígidos' },
  { value: 'TRACTOR', label: 'Tractocamiones' },
  { value: 'TRAILER', label: 'Remolques' },
  { value: 'BALANCED_TRAILER', label: 'Remolques balanceados' },
];

/** Tabla completa de configuraciones en un diálogo: filtros por familia, búsqueda por código y una fila por vehículo que abre el detalle. */
@Component({
  selector: 'app-vehicle-table',
  imports: [VehicleDiagramComponent, CloseOnBackdropDirective],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [`
    dialog { width: min(960px, calc(100vw - 24px)); max-height: calc(100dvh - 24px); padding: 0; overflow: hidden; }
    .shell { display: flex; flex-direction: column; max-height: calc(100dvh - 24px); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 20px; border-bottom: 1px solid var(--c-bd); }
    h2 { margin: 0; font-size: 1.15rem; color: var(--c-head); }
    .toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px; padding: 12px 20px; }
    .chips { display: inline-flex; flex-wrap: wrap; gap: 2px; padding: 3px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); }
        .chips button { padding: 6px 12px; border: 0; border-radius: 7px; background: none; color: var(--c-mu); font: inherit; font-size: 0.82rem; font-weight: 600; cursor: pointer; }
        .chips button[aria-pressed='true'] { background: var(--c-primary); color: var(--c-gray-50); }
    .search { flex: 1 1 200px; max-width: 280px; margin-left: auto; }
    .legend { display: flex; flex-wrap: wrap; gap: 2px 14px; margin: 0; padding: 0 20px 8px; font-size: 0.8rem; color: var(--c-mu); }
    .legend b { color: var(--c-head); }
    .scroll { overflow: auto; padding: 0 20px 18px; }
    table { width: 100%; min-width: 620px; border-collapse: collapse; font-size: 0.9rem; }
    th, td { padding: 8px 10px; text-align: left; border-bottom: 1px solid var(--c-bd); vertical-align: middle; }
    th { position: sticky; top: 0; background: var(--c-sf); font-size: 0.78rem; color: var(--c-mu); }
    td.thumb { width: 110px; }
    app-vehicle-diagram { --diagram-max-h: 44px; }
    td button { padding: 4px 8px; border: 0; border-radius: 6px; background: none; color: var(--c-accent); font: inherit; font-weight: 700; text-decoration: underline; cursor: pointer; }
    .empty { margin: 14px 0 0; color: var(--c-mu); }
    .source { margin: 0; padding: 10px 20px; border-top: 1px solid var(--c-bd); font-size: 0.8rem; color: var(--c-mu); }
  `],
  template: `
    <dialog #dialog appCloseOnBackdrop class="dialog" aria-labelledby="vehicle-table-title" (close)="closed.emit()" data-testid="vehicle-table">
      <div class="shell">
        <header>
          <h2 id="vehicle-table-title">Configuraciones de vehículos de carga</h2>
          <button type="button" class="btn btn-ghost btn-sm" data-testid="table-close" (click)="close()">Cerrar</button>
        </header>
        <div class="toolbar">
          <div class="chips" role="group" aria-label="Filtrar por tipo de vehículo">
            @for (f of filters; track f.value) {
              <button type="button" [attr.aria-pressed]="family() === f.value" [attr.data-testid]="'filter-' + f.value" (click)="family.set(f.value)">{{ f.label }}</button>
            }
          </div>
          <div class="field search">
            <label class="sr-only" for="vehicle-search">Buscar por código</label>
            <input #search id="vehicle-search" class="input" type="search" autocomplete="off" placeholder="Buscar por código (C3S3)" data-testid="vehicle-search" [value]="query()" (input)="query.set(search.value)" />
          </div>
        </div>
        @if (guide(); as g) {
          <p class="legend" data-testid="code-guide">
            <strong>Cómo leer el código:</strong>
            @for (l of g.letters; track l.symbol) { <span><b>{{ l.symbol }}</b> = {{ l.meaning }}</span> }
            @if (g.digitRule) { <span>{{ g.digitRule }}</span> }
          </p>
        }
        <p class="sr-only" role="status" aria-live="polite" data-testid="vehicle-count">{{ visible().length }} vehículos</p>
        <div class="scroll">
          @if (visible().length > 0) {
            <table>
              <caption class="sr-only">Configuraciones de vehículos de carga</caption>
              <thead><tr><th scope="col"><span class="sr-only">Dibujo</span></th><th scope="col">Código</th><th scope="col">Nombre</th><th scope="col">Ejes</th><th scope="col">PBV máx.</th><th scope="col">Tolerancia</th></tr></thead>
              <tbody>
                @for (v of visible(); track v.code) {
                  <tr data-testid="table-row">
                    <td class="thumb"><app-vehicle-diagram [vehicle]="v" /></td>
                    <th scope="row"><button type="button" [attr.aria-label]="'Ver características de ' + v.code" data-testid="table-open" (click)="chosen.emit({ vehicle: v, event: $event })">{{ v.code }}</button></th>
                    <td>{{ v.name }}</td>
                    <td>{{ axles(v) }}</td>
                    <td>{{ pbv(v) }}</td>
                    <td>{{ tolerance(v) }}</td>
                  </tr>
                }
              </tbody>
            </table>
          } @else {
            <p class="empty" data-testid="vehicles-empty">Ningún vehículo coincide con el filtro.</p>
          }
        </div>
        <p class="source" data-testid="regulation">
          Fuente normativa:
          @if (regulationUrl(); as url) { <a [href]="url" target="_blank" rel="noopener noreferrer">{{ regulation().name }}</a> } @else { {{ regulation().name }} }
          ({{ regulation().entity }}).
        </p>
      </div>
    </dialog>
  `,
})
export class VehicleTableComponent {
  readonly vehicles = input.required<readonly FreightVehicle[]>();
  readonly regulation = input.required<VehicleRegulation>();
  readonly guide = input<CodeGuide | null>(null);
  readonly closed = output();
  readonly chosen = output<{ vehicle: FreightVehicle; event: Event }>();

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly filters = FILTERS;
  protected readonly family = signal<FamilyFilter>('ALL');
  protected readonly query = signal('');
  protected readonly regulationUrl = computed(() => safeHttpUrl(this.regulation().url));
  protected readonly visible = computed(() => {
    const family = this.family();
    const text = this.query().trim().toLowerCase();

    return this.vehicles().filter((v) => (family === 'ALL' || v.family === family) && (text === '' || v.code.toLowerCase().includes(text) || v.designation.toLowerCase().includes(text)));
  });

  constructor() {
    afterNextRender(() => {
      const dialog = this.dialog().nativeElement;
      if (!dialog.open) dialog.showModal();
    });
  }

  protected axles = axlesLabel;
  protected pbv(v: FreightVehicle): string {
    const max = pbvMax(v);

    return max === null ? 'Sin dato verificado' : formatKg(max);
  }
  protected tolerance(v: FreightVehicle): string {
    return v.toleranceKg === null ? '—' : formatKg(v.toleranceKg);
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }
}
