import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { map } from 'rxjs';
import { PlatformAccess } from '../../core/auth/platform-access';
import { IntelligenceCostsComponent } from './intelligence-costs.component';
import { IntelligenceEnergyComponent } from './intelligence-energy.component';
import { IntelligenceOverviewComponent } from './intelligence-overview.component';
import { IntelligenceSourcesDialogComponent } from './intelligence-sources-dialog.component';
import { IntelligenceFacade } from './intelligence.facade';
import { PANEL_STYLES } from './intelligence.styles';

type TabId = 'overview' | 'energy' | 'costs';

/** Encabezado de cada sección; la sección activa la define la ruta (`data.section`), no una pestaña interna. */
const SECTIONS: Readonly<Record<TabId, { title: string; subtitle: string }>> = {
  overview: { title: 'LoGyCO₂ Intelligence', subtitle: 'Inteligencia logística, energética y ambiental para el transporte de carga en Colombia.' },
  energy: { title: 'Mercado energético', subtitle: 'Precios de referencia de los combustibles: ACPM y gasolina por ciudad (CREG) y gas natural vehicular (MinEnergía).' },
  costs: { title: 'Costos de transporte', subtitle: 'Evolución del Índice de Costos del Transporte de Carga por Carretera (ICTC) del DANE.' },
};

/** LoGyCO₂ Intelligence: encabezado, aviso general de error y la sección que la ruta indica (`data.section`). */
@Component({
  selector: 'app-intelligence',
  imports: [DatePipe, RouterLink, IntelligenceOverviewComponent, IntelligenceEnergyComponent, IntelligenceCostsComponent, IntelligenceSourcesDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    PANEL_STYLES,
    `
      :host { display: block; }
      .intel { display: flex; flex-direction: column; gap: 12px; }
      .top { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; flex-wrap: wrap; }
      .top h1 { margin: 0; font-size: 1.6rem; letter-spacing: -0.03em; }
      .top h1 sub { font-size: 0.6em; }
      .top p { margin: 2px 0 0; color: var(--c-mu); font-size: 0.9rem; max-width: 640px; }
      .admin-link { display: inline-flex; align-items: center; gap: 8px; background: var(--c-sf); }
      .admin-link svg { width: 16px; height: 16px; }
      .area { display: flex; flex-direction: column; gap: 12px; min-height: 0; }
      .tab-panel { min-height: 0; }
      .foot-note { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; font-size: 0.74rem; color: var(--c-mu); }
      .foot-note span { display: inline-flex; align-items: center; gap: 8px; }
      .foot-note svg { width: 16px; height: 16px; }

      /* A pantalla completa (escritorio, ventana alta): todo cabe en la ventana; las gráficas toman el alto sobrante. */
      @media (min-width: 1101px) and (min-height: 700px) {
        .intel { height: calc(100dvh - var(--header-h) - 56px); }
        .area { flex: 1 1 0; }
        .tab-panel { flex: 1 1 0; overflow-y: auto; display: block; }
      }
    `,
  ],
  template: `
    <div class="page intel">
      <header class="top">
        <div>
          @if (tab() === 'overview') { <h1>LoGyCO<sub>2</sub> Intelligence</h1> } @else { <h1 data-testid="section-title">{{ heading().title }}</h1> }
          <p>{{ heading().subtitle }}</p>
        </div>
        @if (isAdmin()) {
          <a class="btn btn-secondary admin-link" routerLink="/plataforma/intelligence/fuentes" data-testid="intelligence-admin">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2 1.2L10 21h4l.6-2.7c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z" /></svg>Administrar fuentes
          </a>
        }
      </header>

      @if (sharedError(); as e) {
        <div class="alert alert-danger" role="alert" data-testid="shared-error">
          <div class="stack" style="gap: 4px; flex: 1">
            <strong>No se pudo cargar LoGyCO₂ Intelligence.</strong>
            <span>{{ e.message }}</span>
            @if (e.requestId) { <span class="small">Identificador de solicitud: <code>{{ e.requestId }}</code></span> }
          </div>
          <button type="button" class="btn btn-secondary btn-sm" (click)="facade.loadAll()" data-testid="shared-retry">Reintentar</button>
        </div>
      }

      <div class="area">
        <section class="tab-panel" [id]="'panel-' + tab()">
          @switch (tab()) {
            @case ('energy') { <app-intelligence-energy /> }
            @case ('costs') { <app-intelligence-costs /> }
            @default { <app-intelligence-overview (sources)="sourcesDialog().open()" /> }
          }
        </section>
      </div>

      <p class="foot-note">
        <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8h.01M11 12h1v5h1" /></svg>Valores de fuentes oficiales; consulta la metodología y las condiciones de uso en cada fuente. Variaciones calculadas.</span>
        @if (lastUpdate(); as moment) { <span data-testid="last-update">Última actualización general: {{ moment | date: 'medium' }}</span> }
      </p>
    </div>

    <app-intelligence-sources-dialog />
  `,
})
export class IntelligenceComponent {
  protected readonly facade = inject(IntelligenceFacade);
  protected readonly sourcesDialog = viewChild.required(IntelligenceSourcesDialogComponent);
  protected readonly isAdmin = inject(PlatformAccess).isSuperAdmin;
  protected readonly sharedError = this.facade.sharedError;
  private readonly route = inject(ActivatedRoute);
  protected readonly tab = toSignal<TabId, TabId>(this.route.data.pipe(map((data) => (data['section'] as TabId | undefined) ?? 'overview')), { initialValue: 'overview' });
  protected readonly heading = computed(() => SECTIONS[this.tab()]);
  /** Última actualización exitosa de cualquier fuente. */
  protected readonly lastUpdate = computed(() => {
    const times = (this.facade.sources.data() ?? []).flatMap((s) => (s.lastSuccessAt ? [s.lastSuccessAt.getTime()] : []));

    return times.length ? new Date(Math.max(...times)) : null;
  });

  constructor() {
    this.facade.loadAll();
  }
}
