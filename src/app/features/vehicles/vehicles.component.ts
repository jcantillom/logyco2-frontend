import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router } from '@angular/router';
import { map } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { OrganizationContext, reloadOnContextChange } from '../../core/org/organization-context';
import { Vehicle, VehicleDetail } from '../../domain/models/vehicles';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { AnalysisFacade } from './analysis.facade';
import { AnalysisWizardComponent } from './analysis-wizard.component';
import { RecentAnalysesComponent } from './recent-analyses.component';
import { VehicleDetailComponent } from './vehicle-detail.component';
import { VehicleFormComponent } from './vehicle-form.component';
import { VehicleInventoryComponent } from './vehicle-inventory.component';
import { VehiclesFacade } from './vehicles.facade';

const ICONS = { upload: 'M12 16V4M7 9l5-5 5 5M4 20h16' } as const;

type WizardIntent = 'new' | 'conflicts';

@Component({
  selector: 'app-vehicles',
  imports: [PageHeroComponent, VehicleInventoryComponent, VehicleDetailComponent, VehicleFormComponent, AnalysisWizardComponent, RecentAnalysesComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg.i { width: 1em; height: 1em; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .add { display: inline-flex; align-items: center; gap: 8px; min-height: 38px; }
    `,
  ],
  template: `
    <div class="page">
      <app-page-hero title="Mis vehículos" subtitle="Los vehículos de tu empresa, a partir de tus archivos y de los registros manuales." />


      @if (canImport()) {
        <div class="row" style="justify-content: flex-end"><button type="button" class="btn btn-primary add" data-testid="analyze-top" (click)="openAssistant($event)"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.upload" /></svg>Analizar archivo Excel</button></div>
      }
      <app-recent-analyses (open)="openRun($event.id, null)" />

      <app-vehicle-inventory
        [source]="facade" [pendingNew]="hasPending('new')" [pendingConflicts]="hasPending('conflicts')"
        (view)="openDetail($event.event, $event.vehicle)" (register)="openForm($event, null)" (analyze)="openAssistant($event)" (openPending)="openLatest($event)"
      />
    </div>

    @if (showWizard()) {
      <app-analysis-wizard [analysisId]="analysisId()" [initialStep]="intent()" (analysisChange)="setAnalysis($event)" (closed)="closeAssistant()" />
    }
    @if (selected(); as vehicle) {
      <app-vehicle-detail [vehicle]="vehicle" (closed)="closeDetail()" (edit)="editFrom($event)" />
    }
    @if (form(); as f) {
      <app-vehicle-form [vehicle]="f.vehicle" (closed)="closeForm()" />
    }
  `,
})
export class VehiclesComponent {
  protected readonly facade = inject(VehiclesFacade);
  private readonly access = inject(AccessPolicy);
  private readonly analysis = inject(AnalysisFacade);
  private readonly router = inject(Router);
  private readonly context = inject(OrganizationContext);

  protected readonly icons = ICONS;
  protected readonly selected = signal<Vehicle | null>(null);
  protected readonly form = signal<{ readonly vehicle: VehicleDetail | null } | null>(null);

  protected readonly assistantOpen = signal(false);
  protected readonly intent = signal<WizardIntent | null>(null);
  /** Corrida abierta, tomada de la URL (`?analysis=<id>`) para poder volver a ella con un enlace o desde la campana. */
  protected readonly analysisId = toSignal(inject(ActivatedRoute).queryParamMap.pipe(map((params) => params.get('analysis'))), { initialValue: null });
  protected readonly showWizard = computed(() => this.assistantOpen() || this.analysisId() !== null);
  protected readonly canImport = computed(() => this.access.can('imports:create'));

  /** Quien abrió el diálogo recupera el foco al cerrarse (también al pasar del detalle a la edición). */
  private opener: HTMLElement | null = null;
  private lastOrganization: string | null = null;

  constructor() {
    reloadOnContextChange(() => {
      this.facade.loadSummary();
      this.facade.loadList();
      this.facade.loadCatalog();
      this.analysis.loadRecent();
      this.analysis.loadLatestPending();
      if (this.lastOrganization !== null && this.lastOrganization !== this.context.activeOrganizationId()) this.closeAssistant();
      this.lastOrganization = this.context.activeOrganizationId();
      this.selected.set(null);
      this.form.set(null);
    });

  }

  /** La tarjeta está activa si la corrida más reciente con pendientes tiene algo de ese tipo por decidir. */
  protected hasPending(kind: WizardIntent): boolean {
    const latest = this.analysis.latestPending.data();

    return !!latest && (kind === 'new' ? latest.pending.new > 0 : latest.pending.conflict > 0);
  }

  protected openLatest(kind: WizardIntent): void {
    const latest = this.analysis.latestPending.data();

    if (latest) this.openRun(latest.id, kind);
  }

  protected openAssistant(event: Event): void {
    this.opener = event.currentTarget as HTMLElement;
    this.intent.set(null);
    this.assistantOpen.set(true);
  }

  protected openRun(id: string, intent: WizardIntent | null): void {
    this.opener = (document.activeElement as HTMLElement | null) ?? this.opener;
    this.intent.set(intent);
    this.assistantOpen.set(true);
    this.setAnalysis(id);
  }

  /** La corrida abierta vive en la URL: se escribe sin apilar entradas del historial. */
  protected setAnalysis(id: string | null): void {
    void this.router.navigate([], { queryParams: { analysis: id }, queryParamsHandling: 'merge', replaceUrl: true });
  }

  protected closeAssistant(): void {
    this.assistantOpen.set(false);
    this.intent.set(null);
    this.setAnalysis(null);
    this.restoreFocus();
  }

  protected openDetail(event: Event, vehicle: Vehicle): void {
    this.opener = event.currentTarget as HTMLElement;
    this.selected.set(vehicle);
  }

  protected closeDetail(): void {
    this.selected.set(null);
    this.restoreFocus();
  }

  protected openForm(event: Event, vehicle: VehicleDetail | null): void {
    this.opener = event.currentTarget as HTMLElement;
    this.form.set({ vehicle });
  }

  /** De «Editar» en el detalle: se cierra el detalle y se abre el formulario sin perder a quién devolver el foco. */
  protected editFrom(vehicle: VehicleDetail): void {
    this.selected.set(null);
    this.form.set({ vehicle });
  }

  protected closeForm(): void {
    this.form.set(null);
    this.restoreFocus();
  }

  private restoreFocus(): void {
    queueMicrotask(() => this.opener?.isConnected && this.opener.focus());
  }
}
