import { ChangeDetectionStrategy, Component, computed, inject, output, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ConfirmResult, ConfirmSelection, Finding } from '../../domain/models/vehicles';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { Label } from '../../shared/ui/labels';
import { AnalysisFacade } from './analysis.facade';
import { unreadableNote } from './analysis.labels';
import { ANALYSIS_STYLES } from './analysis.styles';
import { FindingDetailComponent } from './finding-detail.component';
import { VehiclesFacade } from './vehicles.facade';
import { fuelLabel } from './vehicles.labels';

const NEW_LABEL: Label = { text: 'Nuevo', tone: 'info' };

/** Paso 3: vehículos que el archivo trae y la empresa aún no tiene. Registrarlos es una decisión de quien administra. */
@Component({
  selector: 'app-new-vehicles-step',
  imports: [PaginationComponent, ResourceStateComponent, StatusBadgeComponent, FindingDetailComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [ANALYSIS_STYLES],
  template: `
    @if (!canManage()) {
      <p class="note" data-testid="read-only">Solo quien administra los vehículos puede registrarlos. Aquí puedes revisar lo que trae el archivo.</p>
    }
    @if (result(); as r) {
      <p class="result" role="status" data-testid="confirm-result">{{ resultText(r) }}</p>
    }
    @if (error(); as e) {
      <p class="err" role="alert" data-testid="confirm-error">{{ e.message }}</p>
    }
    <app-resource-state [status]="analysis.newFindings.status()" [error]="analysis.newFindings.error()" (retry)="analysis.loadState('NEW', page())">
      @if (analysis.newFindings.data(); as data) {
        @if (data.total === 0) {
          <p class="empty" data-testid="new-empty">No hay vehículos nuevos por decidir.</p>
        } @else {
          <div class="bar">
            <span class="grow muted small" aria-live="polite" data-testid="new-total">{{ data.total }} {{ data.total === 1 ? 'vehículo nuevo' : 'vehículos nuevos' }} · {{ selected().size }} seleccionados</span>
            @if (canManage()) {
              <button type="button" class="btn btn-primary btn-sm" data-testid="register-selected" [disabled]="selected().size === 0 || busy()" (click)="registerSelected()">Registrar seleccionados</button>
              <button type="button" class="btn btn-secondary btn-sm" data-testid="register-all" [disabled]="busy()" (click)="registerAll(data.total)">Registrar todos los nuevos</button>
            }
            <button type="button" class="btn btn-secondary btn-sm" data-testid="review-one" (click)="review(data.items)">Revisar individualmente</button>
            <button type="button" class="btn btn-ghost btn-sm" data-testid="leave-pending" (click)="leave.emit()">Dejar pendientes</button>
          </div>
          <div class="tw">
            <table class="tbl" data-testid="new-table">
              <caption class="sr-only">Vehículos nuevos del archivo</caption>
              <thead>
                <tr>
                  <th scope="col"><input type="checkbox" aria-label="Seleccionar todos los de esta página" [checked]="allSelected(data.items)" [disabled]="!canManage()" (change)="toggleAll(data.items)" /></th>
                  <th scope="col">Placa</th><th scope="col">Configuración</th><th scope="col">Combustible</th><th scope="col">Modelo</th><th scope="col">Fuente</th><th scope="col">Estado</th>
                </tr>
              </thead>
              <tbody>
                @for (f of data.items; track f.id) {
                  <tr>
                    <td class="k-pick"><input type="checkbox" [attr.aria-label]="'Seleccionar ' + f.plate" [checked]="selected().has(f.id)" [disabled]="!canManage()" (change)="toggle(f.id)" /></td>
                    <th scope="row">{{ f.plate }}@if (f.plateOriginal !== f.plate) { <small>Como llegó: {{ f.plateOriginal }}</small> }@if (unreadable(f); as note) { <small data-testid="unreadable">{{ note }}</small> }</th>
                    <td data-l="Configuración">{{ configuration(f) }}</td>
                    <td data-l="Combustible">{{ fuel(f.detected.fuelType) }}</td>
                    <td data-l="Modelo">{{ f.detected.modelYear ?? '—' }}</td>
                    <td data-l="Fuente">{{ analysis.analysis.data()?.fileName ?? '—' }}</td>
                    <td data-l="Estado"><app-status-badge [label]="newLabel" /></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
          <div class="foot"><app-pagination [page]="data" (pageChange)="goTo($event)" /></div>
        }
      }
    </app-resource-state>
    @if (detail(); as f) {
      <app-finding-detail [finding]="f" [canManage]="canManage()" [busy]="busy()" (closed)="detail.set(null)" (register)="registerOne($event)" />
    }
  `,
})
export class NewVehiclesStepComponent {
  protected readonly analysis = inject(AnalysisFacade);
  private readonly vehicles = inject(VehiclesFacade);
  private readonly access = inject(AccessPolicy);
  private readonly confirm = inject(ConfirmService);

  /** «Dejar pendientes»: se cierra sin decidir; los vehículos siguen disponibles en «Cargas recientes». */
  readonly leave = output();

  protected readonly newLabel = NEW_LABEL;
  protected readonly canManage = computed(() => this.access.can('vehicles:manage'));
  protected readonly selected = signal<ReadonlySet<string>>(new Set());
  protected readonly detail = signal<Finding | null>(null);
  protected readonly busy = signal(false);
  protected readonly result = signal<ConfirmResult | null>(null);
  protected readonly error = signal<AppError | null>(null);
  protected readonly page = computed(() => this.analysis.newFindings.data()?.page ?? 1);
  protected readonly fuel = fuelLabel;
  protected readonly unreadable = unreadableNote;

  protected configuration(f: Finding): string {
    const code = f.detected.configurationCode;

    if (!code) return '—';

    const name = this.vehicles.catalog.data()?.items.find((item) => item.code === code)?.shortName;

    return name ? `${code} · ${name}` : code;
  }

  protected resultText(r: ConfirmResult): string {
    const parts = [`${r.registered} ${r.registered === 1 ? 'vehículo registrado' : 'vehículos registrados'}`];

    if (r.alreadyRegistered > 0) parts.push(`${r.alreadyRegistered} ya estaban registrados`);
    if (r.skipped > 0) parts.push(`${r.skipped} omitidos`);

    return parts.join(' · ');
  }

  protected allSelected(items: readonly Finding[]): boolean {
    return items.length > 0 && items.every((f) => this.selected().has(f.id));
  }

  protected toggle(id: string): void {
    this.selected.update((set) => {
      const next = new Set(set);

      if (!next.delete(id)) next.add(id);

      return next;
    });
  }

  protected toggleAll(items: readonly Finding[]): void {
    const every = this.allSelected(items);

    this.selected.update((set) => {
      const next = new Set(set);

      for (const f of items) {
        if (every) next.delete(f.id);
        else next.add(f.id);
      }

      return next;
    });
  }

  protected goTo(page: number): void {
    this.analysis.loadState('NEW', page);
  }

  protected review(items: readonly Finding[]): void {
    this.detail.set(items.find((f) => this.selected().has(f.id)) ?? items[0] ?? null);
  }

  protected registerSelected(): void {
    this.run({ findingIds: [...this.selected()] });
  }

  protected registerOne(id: string): void {
    this.run({ findingIds: [id] }, () => this.detail.set(null));
  }

  protected async registerAll(total: number): Promise<void> {
    const ok = await this.confirm.confirm({
      title: 'Registrar todos los vehículos nuevos',
      message: `Se registrarán ${total} ${total === 1 ? 'vehículo nuevo' : 'vehículos nuevos'} en tu empresa. Esta acción queda en el historial de cada vehículo.`,
      confirmLabel: `Registrar ${total}`,
    });

    if (ok) this.run({ allNew: true });
  }

  private run(selection: ConfirmSelection, done?: () => void): void {
    this.busy.set(true);
    this.error.set(null);
    this.result.set(null);

    this.analysis.confirm(selection).subscribe({
      next: (result) => {
        this.busy.set(false);
        this.result.set(result);
        this.selected.set(new Set());
        done?.();
      },
      error: (e: unknown) => {
        this.busy.set(false);
        this.error.set(toAppError(e));
      },
    });
  }
}
