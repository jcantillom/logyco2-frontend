import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { Footprint } from '../../domain/models/footprint';
import { MethodologyFacade } from './methodology.facade';
import { FACTORS_PER_PAGE, REFERENCES_PER_PAGE, USED_FACTORS_PER_PAGE, barSegments, factorUnit, kgText, originClass, pageCount, pageSlice, pctText, reviewLabel, tabKeyTarget, tripsText } from './methodology.view';

type Tab = 'origin' | 'coverage' | 'method';
type PageKind = 'factors' | 'references' | 'used';
type Section = 'scope' | 'factors' | 'references' | 'data' | 'limits';

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'origin', label: 'Origen del dato' },
  { id: 'coverage', label: 'Cobertura del inventario' },
  { id: 'method', label: 'Metodología' },
];
const SECTIONS: readonly { readonly id: Section; readonly label: string }[] = [
  { id: 'scope', label: 'Alcance y unidad' },
  { id: 'factors', label: 'Factores' },
  { id: 'references', label: 'Referencias' },
  { id: 'data', label: 'Datos y distancia' },
  { id: 'limits', label: 'Incertidumbre y límites' },
];

let nextId = 0;

/**
 * «Metodología y calidad del dato»: el detalle compacto del Resumen. Tres pestañas: «Origen del dato» (reparto de los kg contabilizados por el origen de la energía),
 * «Cobertura del inventario» (calculados, pendientes y bloqueados frente al denominador; retenidos, duplicados y anulados aparte) y «Metodología» (la declaración vigente por
 * secciones, con paginación en las listas largas: sin scroll interno en escritorio). Los dos indicadores salen de la huella ya cargada; la declaración se pide al abrir.
 * Solo se muestran textos y cifras del servidor (porcentajes ya redondeados, sin recalcular). Todo dato es declarado por la empresa: ningún origen se presenta como verificado.
 */
@Component({
  selector: 'app-methodology-dialog',
  imports: [NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.mdl { width: min(880px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100dvh - 24px); overflow: visible; border-radius: 16px; background: var(--c-sf); }
      dialog.mdl[open] { display: block; }
      .hd { padding: 12px 20px; border-bottom: 1px solid var(--c-bd); border-radius: 16px 16px 0 0; background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .hd h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.01em; color: var(--c-head); }
      .hd p { margin: 2px 0 0; font-size: 0.8rem; color: var(--c-mu); }
      .warn { margin: 6px 0 0; padding: 5px 10px; border-radius: 8px; background: var(--c-warn-soft); box-shadow: inset 0 0 0 1px var(--c-dot-warning); font-size: 0.78rem; color: var(--c-warning); }
      .tabs { display: flex; flex-wrap: wrap; gap: 4px; margin: 0; padding: 8px 20px 0; border-bottom: 1px solid var(--c-bd); }
      .subtabs { display: flex; flex-wrap: wrap; gap: 6px; padding: 8px 20px 0; }
      .tab { padding: 6px 12px; border: 0; border-bottom: 3px solid transparent; background: none; color: var(--c-text2); font: inherit; font-size: 0.86rem; font-weight: 650; cursor: pointer; }
      .tab[aria-selected='true'] { border-bottom-color: var(--c-primary); color: var(--c-head); }
      .sub { padding: 3px 11px; border: 1px solid var(--c-bd); border-radius: 999px; background: var(--c-s2); color: var(--c-text2); font: inherit; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
      .sub[aria-selected='true'] { border-color: var(--c-primary); background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: var(--c-head); }
      .tab:focus-visible, .sub:focus-visible, .pg button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .bd { display: grid; gap: 10px; padding: 12px 20px; align-content: start; min-height: 300px; }
      .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 20px; }
      h3 { margin: 0 0 4px; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      p, ul { margin: 0; font-size: 0.84rem; line-height: 1.35; color: var(--c-text2); }
      ul { padding-left: 18px; display: grid; gap: 2px; }
      ul.plain { padding-left: 0; list-style: none; }
      .meta { font-size: 0.78rem; color: var(--c-mu); }
      .bar { display: flex; gap: 2px; height: 14px; border-radius: 7px; overflow: hidden; background: var(--c-s3); }
      .bar i { display: block; min-width: 2px; }
      .o0 { background: var(--c-chart-7); } .o1 { background: var(--c-chart-2); } .o2 { background: var(--c-chart-1); } .o3 { background: var(--c-chart-3); } .o4 { background: var(--c-chart-6); }
      .legend { display: grid; gap: 6px; margin: 0; padding: 0; list-style: none; }
      .legend li { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: baseline; gap: 2px 10px; }
      .legend .sw { width: 10px; height: 10px; border-radius: 3px; align-self: center; }
      .legend b { font-size: 0.86rem; color: var(--c-head); }
      .legend .fig { font-size: 0.82rem; color: var(--c-text2); font-variant-numeric: tabular-nums; text-align: right; }
      .legend .mean { grid-column: 2 / -1; font-size: 0.76rem; color: var(--c-mu); }
      .legend ul.src { grid-column: 2 / -1; padding-left: 14px; font-size: 0.78rem; }
      table { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      th, td { padding: 4px 8px; border-bottom: 1px solid var(--c-bd); text-align: left; color: var(--c-text2); vertical-align: top; }
      th { font-size: 0.72rem; font-weight: 700; color: var(--c-mu); }
      td.n, th.n { text-align: right; font-variant-numeric: tabular-nums; }
      tr.tot th, tr.tot td { font-weight: 750; color: var(--c-head); }
      .big { font-size: 1.6rem; font-weight: 750; letter-spacing: -0.02em; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .badge { display: inline-block; padding: 2px 10px; border-radius: 999px; background: var(--c-warn-soft); box-shadow: inset 0 0 0 1px var(--c-dot-warning); font-size: 0.76rem; font-weight: 700; color: var(--c-warning); }
      .ref { display: grid; gap: 2px; padding: 6px 10px; border: 1px solid var(--c-bd); border-radius: 10px; }
      .ref b { font-size: 0.84rem; color: var(--c-head); }
      .pg { display: flex; align-items: center; gap: 10px; font-size: 0.78rem; color: var(--c-mu); }
      .pg button { padding: 2px 10px; border: 1px solid var(--c-bd); border-radius: 8px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.78rem; cursor: pointer; }
      .pg button:disabled { opacity: 0.5; cursor: default; }
      .claims { margin: 0; padding: 8px 20px; border-top: 1px solid var(--c-bd); background: var(--c-s2); font-size: 0.76rem; color: var(--c-text2); }
      .claims b { color: var(--c-head); }
      .err { margin: 0; font-size: 0.84rem; color: var(--c-danger); }
      .err button { margin-left: 8px; padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.78rem; cursor: pointer; }
      .ft { display: flex; justify-content: flex-end; padding: 10px 20px; border-top: 1px solid var(--c-bd); border-radius: 0 0 16px 16px; }
      @media (max-width: 719px) {
        dialog.mdl { width: 100vw; max-width: 100vw; height: auto; max-height: 100dvh; margin: 0; border-radius: 0; overflow: hidden; }
        dialog.mdl[open] { display: flex; flex-direction: column; }
        .bd { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
        .hd, .tabs, .subtabs, .claims, .ft { flex: none; border-radius: 0; }
        .cols { grid-template-columns: minmax(0, 1fr); }
      }
    `,
  ],
  template: `
    <dialog #dialog class="dialog mdl" [attr.aria-labelledby]="titleId" (close)="closed.emit()" data-testid="methodology-dialog">
      <header class="hd">
        <h2 [id]="titleId">Metodología y calidad del dato</h2>
        @if (footprint()?.methodology; as ref) {
          <p data-testid="methodology-line">Versión {{ ref.version }} · {{ ref.scopeLabel }} · {{ ref.unit }}</p>
          @if (ref.hasEstimates) { <p class="warn" data-testid="methodology-estimates">{{ estimatesText() }}</p> }
        }
      </header>

      <div class="tabs" role="tablist" aria-label="Secciones de la metodología y calidad del dato">
        @for (t of tabs; track t.id; let i = $index) {
          <button type="button" role="tab" class="tab" [id]="uid + '-tab-' + t.id" [attr.aria-selected]="tab() === t.id" [attr.aria-controls]="uid + '-panel'" [tabindex]="tab() === t.id ? 0 : -1" [attr.data-testid]="'methodology-tab-' + t.id" (click)="selectTab(t.id)" (keydown)="onKey($event, 'tab', i)">{{ t.label }}</button>
        }
      </div>
      @if (tab() === 'method') {
        <div class="subtabs" role="tablist" aria-label="Secciones de la metodología">
          @for (s of sections; track s.id; let i = $index) {
            <button type="button" role="tab" class="sub" [id]="uid + '-sub-' + s.id" [attr.aria-selected]="section() === s.id" [attr.aria-controls]="uid + '-panel'" [tabindex]="section() === s.id ? 0 : -1" [attr.data-testid]="'methodology-section-' + s.id" (click)="selectSection(s.id)" (keydown)="onKey($event, 'section', i)">{{ s.label }}</button>
          }
        </div>
      }

      <div class="bd" role="tabpanel" [id]="uid + '-panel'" [attr.aria-labelledby]="uid + (tab() === 'method' ? '-sub-' + section() : '-tab-' + tab())" tabindex="0" data-testid="methodology-panel">
        @switch (tab()) {
          @case ('origin') {
            @if (footprint()?.dataOriginShare; as share) {
              <div class="bar" aria-hidden="true" data-testid="origin-bar">@for (s of segments(); track s.key) { <i [class]="originClass(s.key)" [style.flex-grow]="s.pct"></i> }</div>
              <ul class="legend" data-testid="origin-legend">
                @for (b of share.buckets; track b.key) {
                  <li [attr.data-testid]="'origin-' + b.key">
                    <span class="sw" [class]="originClass(b.key)" aria-hidden="true"></span>
                    <b>{{ b.label }}</b>
                    <span class="fig"><span data-testid="origin-pct">{{ pct(b.pct) }}</span> · {{ kg(b.kgCo2) }} · {{ trips(b.trips) }}</span>
                    <span class="mean">{{ b.meaning }}</span>
                    @if (b.sources.length > 0) {
                      <ul class="src" aria-label="Fuentes del estimado por referencia">
                        @for (src of b.sources; track src.source) { <li>{{ src.source }}: {{ pct(src.pct) }} · {{ kg(src.kgCo2) }} · {{ trips(src.trips) }}</li> }
                      </ul>
                    }
                  </li>
                }
              </ul>
              <p class="meta" data-testid="origin-total">Total contabilizado: {{ kg(share.totalKgCo2) }} · {{ trips(share.totalTrips) }}. {{ share.rounding }}</p>
              <p data-testid="origin-verification">{{ share.verification }}</p>
            } @else {
              <p data-testid="origin-none">El servidor no entregó el origen del dato de este periodo.</p>
            }
          }
          @case ('coverage') {
            @if (footprint()?.inventoryCoverage; as c) {
              <div class="cols">
                <div>
                  <h3>Cobertura</h3>
                  <p><span class="big" data-testid="coverage-pct">{{ pct(c.coveragePct) }}</span> de los viajes elegibles</p>
                  <table data-testid="coverage-table">
                    <caption class="sr-only">Viajes elegibles por estado</caption>
                    <tbody>
                      <tr><th scope="row">Calculados</th><td class="n" data-testid="coverage-calculated">{{ trips(c.calculatedTrips) }}</td></tr>
                      <tr><th scope="row">Pendientes</th><td class="n" data-testid="coverage-pending">{{ trips(c.pendingTrips) }}</td></tr>
                      <tr><th scope="row">Bloqueados</th><td class="n" data-testid="coverage-blocked">{{ trips(c.blockedTrips) }}</td></tr>
                      <tr class="tot"><th scope="row">Elegibles (denominador)</th><td class="n" data-testid="coverage-eligible">{{ trips(c.eligibleTrips) }}</td></tr>
                    </tbody>
                  </table>
                </div>
                <div>
                  <h3>Fuera del denominador</h3>
                  <table data-testid="coverage-excluded">
                    <caption class="sr-only">Viajes excluidos del denominador</caption>
                    <thead><tr><th scope="col">Estado</th><th scope="col" class="n">Viajes</th><th scope="col" class="n">kg CO₂</th></tr></thead>
                    <tbody>
                      <tr><th scope="row">Retenidos</th><td class="n">{{ trips(c.excluded.heldTrips) }}</td><td class="n">{{ kg(c.kg.heldKgCo2) }}</td></tr>
                      <tr><th scope="row">Duplicados</th><td class="n">{{ trips(c.excluded.duplicateTrips) }}</td><td class="n">{{ kg(c.kg.duplicateKgCo2) }}</td></tr>
                      <tr><th scope="row">Anulados</th><td class="n">{{ trips(c.excluded.voidedTrips) }}</td><td class="n">{{ kg(c.kg.voidedKgCo2) }}</td></tr>
                    </tbody>
                  </table>
                  <p class="meta" data-testid="coverage-counted">Contabilizado en el inventario: {{ kg(c.kg.countedKgCo2) }}</p>
                </div>
              </div>
              <p data-testid="coverage-denominator">{{ c.denominator }}</p>
              <p class="meta" data-testid="coverage-basis">{{ c.basis }}</p>
            } @else {
              <p data-testid="coverage-none">El servidor no entregó la cobertura de este periodo.</p>
            }
          }
          @default {
            @switch (facade.methodology.status()) {
              @case ('ready') {
                @if (facade.methodology.data(); as m) {
                  @switch (section()) {
                    @case ('scope') {
                      <div class="cols">
                        <div>
                          <h3>Alcance</h3>
                          <p data-testid="method-scope"><b>{{ m.declaration.scope.boundary }}</b> · {{ m.declaration.scope.label }}. {{ m.declaration.scope.description }}</p>
                          <h3>Incluye</h3>
                          <ul>@for (i of m.declaration.scope.included; track $index) { <li>{{ i }}</li> }</ul>
                          <h3>No incluye</h3>
                          <ul data-testid="method-excluded">@for (e of m.declaration.scope.excluded; track $index) { <li>{{ e }}</li> }</ul>
                        </div>
                        <div>
                          <h3>Gases</h3>
                          <ul class="plain" data-testid="method-gases">@for (g of m.declaration.gases; track g.gas) { <li><b>{{ g.gas }}</b> · {{ g.included ? 'Incluido' : 'No incluido' }}. {{ g.note }}</li> }</ul>
                          <h3>Unidad</h3>
                          <p data-testid="method-unit"><b>{{ m.declaration.unit.label }}</b>. {{ m.declaration.unit.statement }}</p>
                        </div>
                      </div>
                    }
                    @case ('factors') {
                      <p data-testid="method-factor-policy">{{ m.declaration.factorPolicy }}</p>
                      <table data-testid="method-factors">
                        <caption class="sr-only">Factores de emisión vigentes</caption>
                        <thead><tr><th scope="col">Combustible</th><th scope="col" class="n">Factor</th><th scope="col">Unidad</th><th scope="col">Fuente</th><th scope="col" class="n">Vigencia</th><th scope="col">Estado</th></tr></thead>
                        <tbody>
                          @for (f of factorRows(); track f.fuelCode) {
                            <tr>
                              <th scope="row">{{ f.name }}</th>
                              <td class="n">{{ f.value ?? '—' }}</td>
                              <td data-testid="method-factor-unit">{{ unitText(f) }}</td>
                              <td>{{ f.sourceName ?? '—' }}@if (f.sourceDocument) { · {{ f.sourceDocument }} }</td>
                              <td class="n">{{ f.referenceYear ?? '—' }}</td>
                              <td>{{ f.usableForCalculation ? 'En uso' : 'Sin uso en el cálculo' }}</td>
                            </tr>
                          }
                        </tbody>
                      </table>
                      @if (factorPages() > 1) { <ng-container *ngTemplateOutlet="pager; context: { kind: 'factors' }" /> }
                      @if (m.usedFactors.length > 0) {
                        <h3>Factores usados en el periodo</h3>
                        <ul class="plain" data-testid="method-used-factors">
                          @for (u of usedRows(); track $index) {
                            <li><b>{{ fuelName(u.fuelCode) }}</b> · {{ u.value }} {{ unitText(u) }} · {{ u.sourceName ?? '—' }}@if (u.referenceYear) { {{ u.referenceYear }} } · {{ trips(u.trips) }}</li>
                          }
                        </ul>
                        @if (usedPages() > 1) { <ng-container *ngTemplateOutlet="pager; context: { kind: 'used' }" /> }
                      }
                    }
                    @case ('references') {
                      <div class="stack" data-testid="method-references">
                        @for (r of referenceRows(); track r.code) { <div class="ref"><b>{{ r.name }}</b><span class="meta">{{ r.role }}</span><span>{{ r.alignment }}</span></div> }
                      </div>
                      @if (referencePages() > 1) { <ng-container *ngTemplateOutlet="pager; context: { kind: 'references' }" /> }
                    }
                    @case ('data') {
                      <div class="cols">
                        <div>
                          <h3>Orígenes del dato</h3>
                          <ul class="plain" data-testid="method-origins">@for (o of m.declaration.activityDataOrigins; track o.key) { <li><b>{{ o.label }}</b>. {{ o.meaning }}</li> }</ul>
                        </div>
                        <div>
                          <h3>Distancia</h3>
                          <ul data-testid="method-distance">@for (d of m.declaration.distanceMethod; track $index) { <li>{{ d }}</li> }</ul>
                        </div>
                      </div>
                    }
                    @default {
                      <div class="cols">
                        <div>
                          <h3>Incertidumbre</h3>
                          <ul data-testid="method-uncertainty">@for (u of m.declaration.uncertainty; track $index) { <li>{{ u }}</li> }</ul>
                          <h3>Valores estimados</h3>
                          <p data-testid="method-estimates">{{ m.declaration.estimatesWarning }}</p>
                        </div>
                        <div>
                          <h3>Limitaciones</h3>
                          <ul data-testid="method-limitations">@for (l of m.declaration.limitations; track $index) { <li>{{ l }}</li> }</ul>
                        </div>
                      </div>
                    }
                  }
                }
              }
              @case ('error') { <p class="err" role="alert" data-testid="method-error">No se pudo cargar la metodología. <button type="button" data-testid="method-retry" (click)="facade.load()">Reintentar</button></p> }
              @default { <span class="skeleton" style="height: 22px" role="status" aria-busy="true" data-testid="method-loading"><span class="sr-only">Cargando…</span></span> }
            }
          }
        }
      </div>

      @if (tab() === 'method' && facade.methodology.data(); as m) {
        <p class="claims" data-testid="method-claims">
          <span class="badge" data-testid="method-review">{{ review(m.declaration.reviewStatus) }}</span>
          {{ ' ' }}<span data-testid="method-approval-note">{{ m.declaration.approvalNote }}</span>
          {{ ' ' }}<span data-testid="method-legal">{{ m.declaration.legalReviewNote }}</span>
          {{ ' ' }}<b data-testid="method-not-claimed">@for (n of m.declaration.notClaimed; track $index) { {{ n }}{{ ' ' }} }</b>
        </p>
      }

      <p class="sr-only" role="status" aria-live="polite" data-testid="methodology-live">{{ announcement() }}</p>
      <footer class="ft"><button type="button" class="btn btn-primary" data-testid="methodology-close" (click)="dialog.close()">Cerrar</button></footer>

      <ng-template #pager let-kind="kind">
        <nav class="pg" [attr.aria-label]="pagerLabel(kind)">
          <button type="button" [attr.data-testid]="'method-prev-' + kind" [disabled]="pageOf(kind) === 0" (click)="turn(kind, -1)">Anterior</button>
          <span role="status">Página {{ pageOf(kind) + 1 }} de {{ pagesOf(kind) }}</span>
          <button type="button" [attr.data-testid]="'method-next-' + kind" [disabled]="pageOf(kind) + 1 >= pagesOf(kind)" (click)="turn(kind, 1)">Siguiente</button>
        </nav>
      </ng-template>
    </dialog>
  `,
})
export class MethodologyDialogComponent {
  protected readonly facade = inject(MethodologyFacade);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Huella ya cargada del Resumen: de ella salen la referencia de la metodología y los dos indicadores. */
  readonly footprint = input<Footprint | null>(null);
  readonly closed = output();

  protected readonly uid = `mdl-${nextId++}`;
  protected readonly titleId = `${this.uid}-title`;
  protected readonly tabs = TABS;
  protected readonly sections = SECTIONS;
  protected readonly tab = signal<Tab>('origin');
  protected readonly section = signal<Section>('scope');
  private readonly pages = signal<Readonly<Record<PageKind, number>>>({ factors: 0, references: 0, used: 0 });
  protected readonly announcement = signal('');

  protected readonly originClass = originClass;
  protected readonly pct = pctText;
  protected readonly kg = kgText;
  protected readonly trips = tripsText;
  protected readonly review = reviewLabel;
  protected readonly segments = computed(() => barSegments(this.footprint()?.dataOriginShare?.buckets ?? []));
  /** Con valores estimados el encabezado advierte con el texto del servidor (cuando ya llegó); mientras tanto, una frase corta de interfaz. */
  protected readonly estimatesText = computed(() => this.facade.methodology.data()?.declaration.estimatesWarning || 'Hay emisiones calculadas con valores estimados.');
  private readonly factors = computed(() => this.facade.methodology.data()?.factors ?? []);
  private readonly references = computed(() => this.facade.methodology.data()?.declaration.referenceStandards ?? []);
  protected readonly factorPages = computed(() => pageCount(this.factors().length, FACTORS_PER_PAGE));
  private readonly used = computed(() => this.facade.methodology.data()?.usedFactors ?? []);
  protected readonly usedPages = computed(() => pageCount(this.used().length, USED_FACTORS_PER_PAGE));
  protected readonly usedRows = computed(() => pageSlice(this.used(), this.pages().used, USED_FACTORS_PER_PAGE));
  protected readonly unitText = factorUnit;
  protected readonly referencePages = computed(() => pageCount(this.references().length, REFERENCES_PER_PAGE));
  protected readonly factorRows = computed(() => pageSlice(this.factors(), this.pages().factors, FACTORS_PER_PAGE));
  protected readonly referenceRows = computed(() => pageSlice(this.references(), this.pages().references, REFERENCES_PER_PAGE));

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
  }

  protected pageOf(kind: PageKind): number {
    return this.pages()[kind];
  }

  protected pagesOf(kind: PageKind): number {
    return kind === 'factors' ? this.factorPages() : kind === 'used' ? this.usedPages() : this.referencePages();
  }

  protected pagerLabel(kind: PageKind): string {
    return kind === 'factors' ? 'Páginas de los factores' : kind === 'used' ? 'Páginas de los factores usados' : 'Páginas de las referencias';
  }

  /** Nombre del combustible de un factor usado: el del factor vigente del servidor; el código si no está. */
  protected fuelName(code: string): string {
    return this.facade.methodology.data()?.factors.find((f) => f.fuelCode === code)?.name ?? code;
  }

  protected turn(kind: PageKind, step: number): void {
    const max = this.pagesOf(kind) - 1;

    this.pages.update((p) => ({ ...p, [kind]: Math.min(max, Math.max(0, p[kind] + step)) }));
    this.announcement.set(`Página ${this.pages()[kind] + 1} de ${max + 1}`);
  }

  protected selectTab(tab: Tab): void {
    this.tab.set(tab);
    this.announcement.set(TABS.find((t) => t.id === tab)?.label ?? '');
  }

  protected selectSection(section: Section): void {
    this.section.set(section);
    this.announcement.set(SECTIONS.find((s) => s.id === section)?.label ?? '');
  }

  /** Flechas, Inicio y Fin cambian de pestaña y mueven el foco a la nueva. */
  protected onKey(event: KeyboardEvent, kind: 'tab' | 'section', index: number): void {
    const count = kind === 'tab' ? TABS.length : SECTIONS.length;
    const target = tabKeyTarget(event.key, index, count);

    if (target === null) return;

    event.preventDefault();

    if (kind === 'tab') this.selectTab(TABS[target].id);
    else this.selectSection(SECTIONS[target].id);

    queueMicrotask(() => this.host.nativeElement.querySelector<HTMLElement>(`#${this.uid}-${kind === 'tab' ? 'tab-' + TABS[target].id : 'sub-' + SECTIONS[target].id}`)?.focus());
  }
}
