import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { isAutoResolved, qualityNoteLines, vehicleDifferenceViews } from '../quality/duplicates.view';
import { OperationTrip, TripDetail } from '../../domain/models/operations';
import { NONE, Tone, distanceText, dayText, efficiencyDisplay, factorText, fuelText, kgText, momentText, quantityText, routeText, sharedTone, tripTone, tonsText, CONVERTED_FROM_KG, CONVERTED_FROM_KG_HINT } from './operations.view';

type DetailTab = 'info' | 'emissions' | 'history';

const TABS: readonly { readonly id: DetailTab; readonly label: string }[] = [
  { id: 'info', label: 'Información' },
  { id: 'emissions', label: 'Cálculo de emisiones' },
  { id: 'history', label: 'Historial' },
];

interface Group {
  readonly title: string;
  readonly rows: readonly Row[];
}

/** Agrupa las filas por su etiqueta (las que no están en el mapa van al grupo `rest`), conservando el orden de aparición de los grupos. */
function groupRows(rows: readonly Row[], map: Readonly<Record<string, string>>, rest: string): readonly Group[] {
  const groups = new Map<string, Row[]>();

  for (const row of rows) {
    const title = map[row.label] ?? (row.label.startsWith('Declarado: ') ? 'Declarado en el archivo' : rest);

    groups.set(title, [...(groups.get(title) ?? []), row]);
  }

  return Array.from(groups, ([title, list]) => ({ title, rows: list }));
}

interface Row {
  readonly label: string;
  readonly value: string;
  readonly hint?: string | null;
  /** Ocupa el ancho completo aunque el valor sea corto (su ayuda es larga). */
  readonly wide?: boolean;
  /** Detalle largo que no cabe en el panel: va como ayuda (`title`) y para lector de pantalla, no a la vista. */
  readonly tip?: string | null;
}

/**
 * Panel «Detalle del viaje»: muestra lo que el servidor guardó del viaje (nada se calcula aquí), con tres pestañas. Mientras llega el detalle, la
 * cabecera usa la fila de la lista. Presentacional: la apertura y la carga viven en `OperationsFacade`.
 */
@Component({
  selector: 'app-trip-detail-panel',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { '(keydown.escape)': 'closed.emit()', '(document:click)': 'onDocumentClick($event)' },
  styles: [
    `
      :host { display: block; min-width: 0; }
      .panel { display: grid; gap: 6px; align-content: start; position: relative; padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-head) 14%, transparent); }
      .head { display: grid; gap: 2px; padding-right: 40px; }
      .cap { font-size: 0.72rem; font-weight: 600; color: var(--c-mu); }
      h2 { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; margin: 0; font-size: 1.2rem; font-weight: 750; line-height: 1.2; color: var(--c-head); overflow-wrap: anywhere; }
      .meta { display: grid; gap: 0; margin-top: 2px; font-size: 0.76rem; line-height: 1.35; color: var(--c-mu); }
      .meta .file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      h2:focus { outline: none; }
      .x { position: absolute; top: 12px; right: 12px; z-index: 1; display: grid; place-items: center; flex: none; width: 32px; height: 32px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); color: var(--c-head); cursor: pointer; }
      .x:focus-visible, .tab:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .x { transition: background-color 0.15s, border-color 0.15s; }
      .x:hover { background: var(--c-s2); border-color: var(--c-primary); }
      .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-size: 0.76rem; font-weight: 700; line-height: 1.4; white-space: nowrap; }
      .chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .chip.success { background: var(--c-success-bg); color: var(--c-success); }
      .chip.warning { background: var(--c-warning-bg); color: var(--c-warning); }
      .chip.danger { background: var(--c-danger-bg); color: var(--c-danger); }
      .chip.info { background: var(--c-info-bg); color: var(--c-info); }
      .tabs { display: flex; overflow: visible; flex-wrap: nowrap; justify-content: space-between; gap: 12px; border-bottom: 1px solid var(--c-bd); }
      .tab { all: unset; box-sizing: border-box; cursor: pointer; padding: 4px 2px; margin-bottom: -1px; border-bottom: 3px solid transparent; font-size: 0.8rem; white-space: nowrap; font-weight: 700; color: var(--c-text2); }
      .tab:hover { color: var(--c-head); }
      .tab[aria-selected='true'] { border-bottom-color: var(--c-primary); color: var(--c-accent); }
      .tab:focus-visible { border-radius: 6px; }
      .body { display: grid; gap: 4px; align-content: start; }
      .grp { display: grid; gap: 2px; }
      .grp + .grp { margin-top: 4px; }
      h3 { margin: 0; font-size: 0.72rem; font-weight: 700; color: var(--c-accent); }
      dl { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; margin: 0; }
      .it { display: grid; align-content: start; gap: 0; min-width: 0; padding: 2px 0; border-bottom: 1px solid var(--c-bd); }
      .it.wide { grid-column: 1 / -1; }
      dt, dd { margin: 0; font-size: 0.82rem; line-height: 1.15; overflow-wrap: anywhere; }
      dt { font-size: 0.72rem; font-weight: 400; color: var(--c-mu); }
      dd { font-weight: 650; color: var(--c-head); }
      dd small { display: inline; margin-left: 6px; font-size: 0.7rem; font-weight: 400; color: var(--c-mu); }
      .note { margin: 0; font-size: 0.88rem; color: var(--c-text2); }
      .guide { margin: 0; padding: 4px 10px; border-radius: 8px; background: var(--c-warning-bg); color: var(--c-warning); font-size: 0.76rem; line-height: 1.25; }
      .events { display: grid; gap: 0; margin: 0; padding: 0; list-style: none; }
      .events li { display: grid; gap: 1px; padding: 5px 0 5px 14px; border-left: 2px solid var(--c-bd); font-size: 0.88rem; font-weight: 650; color: var(--c-head); }
      .events time { font-weight: 400; font-size: 0.8rem; color: var(--c-mu); }
      .kg { display: flex; align-items: center; gap: 12px; padding: 4px 12px; border: 1px solid color-mix(in srgb, var(--c-secondary) 20%, var(--c-sf)); border-radius: 12px; background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); }
      .kg .leaf { display: grid; place-items: center; flex: none; width: 30px; height: 30px; border-radius: 50%; background: color-mix(in srgb, var(--c-secondary) 20%, var(--c-sf)); color: var(--c-success); }
      .kg .leaf svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .kg span { display: block; font-size: 0.8rem; font-weight: 650; color: var(--c-head); }
      .kg .go { margin-left: auto; flex: none; min-height: 32px; padding: 0 12px; font-size: 0.8rem; white-space: nowrap; }
      .head.with-menu { padding-right: 80px; }
      .more { right: 52px; }
      .menu { position: absolute; z-index: 20; top: 48px; right: 12px; display: grid; gap: 2px; min-width: 200px; padding: 4px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); box-shadow: 0 14px 38px color-mix(in srgb, var(--c-head) 20%, transparent); }
      .menu .item { all: unset; box-sizing: border-box; display: block; padding: 7px 10px; border-radius: 8px; font-size: 0.84rem; font-weight: 650; color: var(--c-head); cursor: pointer; }
      .menu .item:hover, .menu .item:focus-visible { background: var(--c-row-hover); }
      .menu .item:focus-visible { outline: 3px solid var(--c-focus); outline-offset: -2px; }
      .menu .item[aria-disabled='true'] { color: var(--c-mu); cursor: not-allowed; }
      .menu .why { margin: 0; padding: 2px 10px 6px; font-size: 0.72rem; line-height: 1.3; color: var(--c-mu); }
      .kg b { font-size: 1.15rem; font-weight: 750; line-height: 1.2; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .skel i { display: block; height: 14px; margin: 14px 0; border-radius: 6px; background: linear-gradient(90deg, var(--c-s3) 25%, var(--c-s2) 50%, var(--c-s3) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
      @keyframes shimmer { to { background-position: -200% 0; } }
      .err { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 0; padding: 12px; border-radius: 10px; background: var(--c-danger-bg); color: var(--c-danger); font-size: 0.88rem; }
      @media (prefers-reduced-motion: reduce) { .skel i { animation: none; } }
    `,
  ],
  template: `
    <section class="panel" aria-labelledby="trip-detail-title" data-testid="trip-detail" [attr.aria-busy]="status() === 'loading'">
      <button type="button" class="x" aria-label="Cerrar el detalle del viaje" data-testid="close-detail" (click)="closed.emit()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>

      @if (canRegister() && status() === 'ready' && !editing() && detail(); as d) {
        <button type="button" class="x more" #menuButton aria-haspopup="menu" aria-controls="trip-menu" [attr.aria-expanded]="menuOpen()" aria-label="Acciones del viaje" title="Acciones del viaje" data-testid="detail-actions-button" (click)="toggleMenu()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5h.01M12 12h.01M12 19h.01" /></svg></button>
        @if (menuOpen()) {
          <div class="menu" id="trip-menu" role="menu" tabindex="-1" aria-label="Acciones del viaje" data-testid="detail-actions" (keydown)="onMenuKey($event)">
            <button type="button" class="item" role="menuitem" tabindex="-1" data-testid="duplicate-action" (click)="choose('duplicate')">Duplicar</button>
            <button type="button" class="item" role="menuitem" tabindex="-1" data-testid="return-action" (click)="choose('return')">Viaje de regreso</button>
            @if (d.source === 'MANUAL' && d.dedup.status !== 'VOIDED') {
              <button type="button" class="item" role="menuitem" tabindex="-1" data-testid="void-action" [attr.aria-disabled]="d.voidable ? null : 'true'" [attr.aria-describedby]="d.voidable ? null : 'void-why'" (click)="choose('void')">Anular viaje</button>
              @if (!d.voidable) { <p class="why" id="void-why" data-testid="void-why">{{ d.voidBlockedReason ?? 'Este viaje no se puede anular.' }}</p> }
            }
          </div>
        }
      }

      <header class="head" [class.with-menu]="canRegister() && status() === 'ready' && !editing()">
        <h2 id="trip-detail-title" tabindex="-1" #title><span class="sr-only">Detalle del viaje </span><span data-testid="detail-id">{{ header()?.title ?? '…' }}</span>@if (header(); as h) { <span class="chip" [class]="'chip ' + h.tone" data-testid="detail-state">{{ h.stateLabel }}</span> }</h2>
        @if (header(); as h) {
          <span class="meta"><span class="file" [attr.title]="h.origin">{{ h.origin }}</span><span>Fecha del viaje: {{ h.date }}</span></span>
        }
      </header>

      <div class="kg" data-testid="detail-kg">
        <span class="leaf" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10" /></svg></span>
        <div><span>Emisiones del viaje</span><b>{{ kg() }}</b></div>
        @if (detail()?.completable && !editing()) {
          <button type="button" class="btn btn-primary go" #action data-testid="complete-action" [disabled]="!canComplete()" [attr.aria-describedby]="canComplete() ? null : 'complete-hint'" (click)="completeRequested.emit()">Completar datos</button>
          @if (!canComplete()) { <small class="sr-only" id="complete-hint" data-testid="complete-hint">Necesitas el permiso para cargar datos de la empresa para completar viajes</small> }
        }
      </div>

      @if (editing()) {
        <div id="trip-tabpanel" class="body" data-testid="detail-editing"><ng-content select="[completion]" /></div>
      } @else {
        <div class="tabs" role="tablist" aria-label="Secciones del detalle">
          @for (t of tabs; track t.id) {
            <button type="button" class="tab" role="tab" [id]="'trip-tab-' + t.id" aria-controls="trip-tabpanel" [attr.data-testid]="'detail-tab-' + t.id" [attr.aria-selected]="tab() === t.id" [attr.tabindex]="tab() === t.id ? 0 : -1" (click)="tab.set(t.id)" (keydown)="onTabKey($event)">{{ t.label }}</button>
          }
        </div>

      <div id="trip-tabpanel" class="body" role="tabpanel" tabindex="0" [attr.aria-labelledby]="'trip-tab-' + tab()">
        @switch (status()) {
          @case ('error') {
            <p class="err" role="alert" data-testid="detail-error">{{ errorMessage() ?? 'No se pudo cargar el detalle del viaje.' }} <button type="button" class="btn btn-secondary btn-sm" (click)="retry.emit()">Reintentar</button></p>
          }
          @case ('ready') {
            @switch (tab()) {
              @case ('info') {
                <div data-testid="detail-info">@for (g of infoGroups(); track g.title) { <section class="grp" [attr.aria-label]="g.title">@if (infoGroups().length > 1) { <h3>{{ g.title }}</h3> }<dl>@for (r of g.rows; track r.label) { <div class="it" [class.wide]="isWide(r)"><dt>{{ r.label }}</dt><dd [attr.title]="r.tip ?? null">{{ r.value }}@if (r.hint) { <small>{{ r.hint }}</small> }@if (r.tip) { <span class="sr-only"> {{ r.tip }}</span> }</dd></div> }</dl></section> }</div>
                @if (detail()?.shared; as s) { <p class="note"><span class="chip" [class]="'chip ' + sharedToneOf(s.state)" data-testid="detail-shared">{{ s.label }}</span></p> }
                @if (refusal(); as r) { <p class="guide" role="note" data-testid="detail-refusal">{{ r }}</p> } @else if (detail()?.reasonLabel; as reason) { <p class="guide" role="note" data-testid="detail-reason">Motivo: {{ reason }}</p> }
                @if (qualityLink(); as q) { <p class="note"><a [routerLink]="'/calidad'" [queryParams]="q.params" data-testid="detail-quality-link">{{ q.label }}</a></p> }
              }
              @case ('emissions') {
                @if (detail()?.emissions) {
                  <div data-testid="detail-emissions">@for (g of emissionGroups(); track g.title) { <section class="grp"><h3>{{ g.title }}</h3><dl>@for (r of g.rows; track r.label) { <div class="it" [class.wide]="isWide(r)"><dt>{{ r.label }}</dt><dd [attr.title]="r.tip ?? null">{{ r.value }}@if (r.hint) { <small>{{ r.hint }}</small> }@if (r.tip) { <span class="sr-only"> {{ r.tip }}</span> }</dd></div> }</dl></section> }</div>
                } @else {
                  <p class="note" data-testid="detail-no-result">Este viaje todavía no tiene resultado calculado.@if (detail()?.reasonLabel; as reason) { Motivo: {{ reason }}. }</p>
                }
              }
              @default {
                @if ((detail()?.history ?? []).length > 0) {
                  <ol class="events" data-testid="detail-history">@for (e of detail()!.history; track $index) { <li>{{ e.label }}<time [attr.datetime]="e.at">{{ moment(e.at) }}</time></li> }</ol>
                } @else { <p class="note">Este viaje no tiene eventos registrados.</p> }
              }
            }
          }
          @default {
            <div class="skel" aria-hidden="true" data-testid="detail-loading"><i style="width: 80%"></i><i style="width: 65%"></i><i style="width: 90%"></i><i style="width: 55%"></i><i style="width: 75%"></i></div>
            <span class="sr-only" role="status">Cargando el detalle del viaje…</span>
          }
        }
      </div>
      }
    </section>
  `,
})
export class TripDetailPanelComponent {
  /** La fila de la lista: da la cabecera mientras llega el detalle. */
  readonly trip = input<OperationTrip | null>(null);
  readonly detail = input<TripDetail | null>(null);
  readonly status = input<ResourceStatus>('loading');
  readonly errorMessage = input<string | null>(null);
  /** El usuario puede completar datos (`imports:create`); sin él, la acción se ve deshabilitada con su explicación. */
  readonly canComplete = input(false);
  /** El formulario de «Completar datos» ocupa el cuerpo del panel (se proyecta con `[completion]`). */
  readonly editing = input(false);
  /** Por qué un viaje por completar o bloqueado no se puede completar en pantalla (texto del servidor). */
  readonly refusal = input<string | null>(null);
  /** El usuario puede registrar viajes (`imports:create`): habilita «Duplicar», «Viaje de regreso» y «Anular viaje». */
  readonly canRegister = input(false);
  readonly closed = output<void>();
  readonly retry = output<void>();
  readonly completeRequested = output<void>();
  readonly duplicateRequested = output<void>();
  readonly returnRequested = output<void>();
  readonly voidRequested = output<void>();

  private readonly heading = viewChild.required<ElementRef<HTMLElement>>('title');
  private readonly action = viewChild<ElementRef<HTMLElement>>('action');
  private readonly menuButton = viewChild<ElementRef<HTMLElement>>('menuButton');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly menuOpen = signal(false);

  protected readonly tabs = TABS;
  protected readonly tab = signal<DetailTab>('info');
  protected readonly moment = momentText;
  /** Acceso contextual a «Calidad de datos» solo cuando hay algo por decidir allí: un posible duplicado retenido o una posible operación compartida. */
  protected readonly qualityLink = computed(() => {
    const d = this.detail();

    if (d?.dedup.status === 'POSSIBLE_DUPLICATE') return { label: 'Revisar este viaje en Calidad de datos', params: {} };

    return d?.shared && d.shared.state !== 'CONFIRMED_MATCH' ? { label: 'Revisar esta operación compartida en Calidad de datos', params: { tab: 'compartidas' } } : null;
  });
  /** Valores largos ocupan el ancho completo; los cortos se emparejan en dos columnas para que el panel quepa sin scroll. */
  protected readonly isWide = (r: Row): boolean => r.wide === true || r.value.length > 18;
  protected readonly sharedToneOf = (state: string): Tone => sharedTone(state);

  protected readonly header = computed(() => {
    const d = this.detail();
    const t = this.trip();

    if (d) return { title: d.tripId ?? 'Viaje sin ID', stateLabel: d.stateLabel, tone: tripTone(d.status, d.dedup.status), origin: d.source === 'MANUAL' ? 'Registrado manualmente' : `Registrado en la carga: ${d.fileName} (fila ${d.rowNumber})`, date: dayText(d.tripDate) };

    return t ? { title: t.tripId ?? 'Viaje sin ID', stateLabel: t.stateLabel, tone: tripTone(t.status, t.dedupStatus), origin: t.source === 'MANUAL' ? 'Registrado manualmente' : `Registrado en la carga: ${t.fileName} (fila ${t.rowNumber})`, date: dayText(t.tripDate) } : null;
  });

  /** «50,745 kg CO₂» (lo guardado al calcular); sin resultado, «—». */
  protected readonly kg = computed(() => {
    const emissions = this.detail()?.emissions;

    return emissions ? `${kgText(emissions.kgCo2)} kg CO₂` : NONE;
  });

  protected readonly infoGroups = computed(() => groupRows(this.infoRows(), { 'Completado en pantalla': 'Completado en pantalla' }, 'Datos del viaje'));
  protected readonly emissionGroups = computed(() => groupRows(this.emissionRows(), { 'Factor de emisión': 'Factor de emisión', 'Fuente del factor': 'Factor de emisión', Calculado: 'Factor de emisión' }, 'Resultado'));

  protected readonly infoRows = computed<readonly Row[]>(() => {
    const d = this.detail();

    if (!d) return [];

    const vehicle = d.vehicle;
    const specs = vehicle ? [vehicle.vehicleType, vehicle.modelYear ? String(vehicle.modelYear) : null, vehicle.capacityTons !== null ? `${tonsText(vehicle.capacityTons)} t` : null].filter((v): v is string => !!v).join(' · ') : '';
    const rows: Row[] = [
      { label: 'Vehículo', value: [d.plate ?? vehicle?.plate, vehicle?.configurationCode].filter((v): v is string => !!v).join(' · ') || NONE, hint: specs || null },
      { label: 'Combustible', value: fuelText(d.fuelType) },
      { label: 'Trayecto', value: routeText(d.origin, d.destination) },
      { label: 'Distancia', value: d.distanceKm === null ? NONE : `${distanceText(d.distanceKm)} km`, hint: d.distanceSourceLabel, wide: (d.distanceSourceLabel ?? '').length > 18 },
      { label: 'Carga transportada', value: d.cargoTon === null ? NONE : `${tonsText(d.cargoTon)} toneladas`, hint: d.cargoConvertedFromKg ? `${CONVERTED_FROM_KG}. ${CONVERTED_FROM_KG_HINT}` : null },
      { label: 'Rendimiento', ...efficiencyDisplay(d) },
    ];

    // El archivo de origen ya está en la cabecera del panel («Registrado en la carga…»): no se repite aquí. De un viaje manual sí se dice quién lo registró.
    if (d.source === 'MANUAL') rows.push({ label: 'Origen de datos', value: `Registrado manualmente por ${d.registeredByName ?? 'una persona que ya no está'}`, hint: momentText(d.createdAt) });

    if (d.serviceId) rows.push({ label: 'ID de servicio', value: d.serviceId });

    if (d.dedup.status !== 'UNIQUE') {
      rows.push({ label: 'Duplicados', value: d.dedup.statusLabel, tip: d.dedup.ruleLabel });

      if (d.dedup.duplicateOf) rows.push({ label: 'Repite al viaje de', value: `${dayText(d.dedup.duplicateOf.tripDate)}${d.dedup.duplicateOf.plate ? ` · ${d.dedup.duplicateOf.plate}` : ''}`, tip: d.dedup.duplicateOf.fileName });

      if (isAutoResolved(d.dedup.evidence)) rows.push({ label: 'Resuelto por', value: 'El sistema, automáticamente', hint: d.dedup.resolvedAt ? momentText(d.dedup.resolvedAt) : null });
      else if (d.dedup.resolvedByName) rows.push({ label: 'Resuelto por', value: d.dedup.resolvedByName, hint: d.dedup.resolvedAt ? momentText(d.dedup.resolvedAt) : null });

      for (const diff of vehicleDifferenceViews(d.dedup.evidence)) rows.push({ label: `Dato distinto: ${diff.label}`, value: `Primer registro «${diff.anchor}», repetido «${diff.repeated}»`, wide: true });

      for (const note of qualityNoteLines(d.dedup.evidence)) rows.push({ label: 'Nota de calidad', value: note, wide: true });
    }

    if (d.corrected) rows.push({ label: 'Completado en pantalla', value: `Corregido por ${d.corrected.byName ?? 'una persona que ya no está'}`, hint: momentText(d.corrected.at) });

    if (d.declared) for (const row of this.declaredRows(d.declared)) rows.push(row);

    return rows;
  });

  /** «Declarado en el archivo»: lo que traía el archivo de cada dato completado (solo lectura); sin valor, «No venía en el archivo». */
  private declaredRows(declared: NonNullable<TripDetail['declared']>): readonly Row[] {
    const values: Readonly<Record<string, string | null>> = {
      fuel_type: declared.fuelType === null ? null : fuelText(declared.fuelType),
      'consumption.quantity': declared.consumption.quantity === null ? null : String(declared.consumption.quantity),
      'consumption.unit': declared.consumption.unit,
      'efficiency.value': declared.efficiency.quantity === null ? null : String(declared.efficiency.quantity),
      'efficiency.unit': declared.efficiency.unit,
      distance_km: declared.distanceKm === null ? null : `${distanceText(declared.distanceKm)} km`,
    };
    const labels: Readonly<Record<string, string>> = {
      fuel_type: 'Combustible',
      'consumption.quantity': 'Consumo',
      'consumption.unit': 'Unidad del consumo',
      'efficiency.value': 'Rendimiento',
      'efficiency.unit': 'Unidad del rendimiento',
      distance_km: 'Distancia',
    };

    return declared.fields.map((name) => ({ label: `Declarado: ${labels[name] ?? name}`, value: values[name] ?? 'No venía en el archivo' }));
  }

  protected readonly emissionRows = computed<readonly Row[]>(() => {
    const d = this.detail();
    const e = d?.emissions;

    if (!d || !e) return [];

    const factor = e.factor;
    const efficiency = efficiencyDisplay(d);

    return [
      { label: 'Emisiones', value: `${kgText(e.kgCo2)} kg CO₂`, hint: d.methodLabel },
      { label: 'Consumo', value: quantityText(d.consumption) },
      { label: 'Volumen normalizado', value: quantityText(d.volumeNormalized) },
      { label: 'Rendimiento', ...efficiency, hint: d.efficiencyLabel || d.vehicleEfficiency ? efficiency.hint : null },
      { label: 'Factor de emisión', value: factor.value === null ? NONE : `${factorText(factor.value)}${factor.unit ? ` ${factor.unit}` : ''}`, hint: factor.fuelCode },
      { label: 'Fuente del factor', value: factor.sourceName ?? NONE, hint: [factor.sourceDocument, factor.referenceYear ? String(factor.referenceYear) : null].filter((v): v is string => !!v).join(' · ') || null },
      { label: 'Calculado', value: momentText(d.calculatedAt) },
    ];
  });

  /** Lleva el foco al título al abrir (lo llama la pantalla). */
  focusTitle(): void {
    this.heading().nativeElement.focus();
    this.heading().nativeElement.scrollIntoView?.({ block: 'nearest' });
  }

  /** Lleva el foco al botón de acciones (al cerrar la confirmación de «Anular viaje»); si ya no está, al título. */
  focusVoid(): void {
    (this.menuButton() ?? this.heading()).nativeElement.focus();
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);

    if (this.menuOpen()) setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[role="menuitem"]')?.focus());
  }

  protected choose(action: 'duplicate' | 'return' | 'void'): void {
    if (action === 'void' && this.detail()?.voidable !== true) return;

    this.menuOpen.set(false);
    (action === 'duplicate' ? this.duplicateRequested : action === 'return' ? this.returnRequested : this.voidRequested).emit();
  }

  /** Flechas, Inicio y Fin recorren las acciones; Escape cierra solo el menú y devuelve el foco al botón; Tab lo cierra. */
  protected onMenuKey(event: KeyboardEvent): void {
    const items = Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[role="menuitem"]'));
    const at = items.indexOf(document.activeElement as HTMLElement);
    const next = { ArrowDown: (at + 1) % items.length, ArrowUp: (at + items.length - 1) % items.length, Home: 0, End: items.length - 1 }[event.key];

    if (next !== undefined) {
      event.preventDefault();
      items[next].focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.menuOpen.set(false);
      this.menuButton()?.nativeElement.focus();
    } else if (event.key === 'Tab') {
      this.menuOpen.set(false);
    }
  }

  protected onDocumentClick(event: Event): void {
    if (this.menuOpen() && !event.composedPath().includes(this.host.nativeElement)) this.menuOpen.set(false);
  }

  /** Devuelve el foco a «Completar datos» (al cerrar el formulario); si ya no está, al título. */
  focusAction(attempt = 0): void {
    const button = this.action();

    if (button) return button.nativeElement.focus();

    // El botón se vuelve a dibujar al salir del formulario: se reintenta unos instantes; si no aparece (el viaje ya no es completable), el foco va al título.
    if (attempt < 10) setTimeout(() => this.focusAction(attempt + 1), 20);
    else this.heading().nativeElement.focus();
  }

  /** Flechas, Inicio y Fin cambian de pestaña y llevan el foco a la elegida. */
  protected onTabKey(event: KeyboardEvent): void {
    const order = TABS.map((t) => t.id);
    const current = order.indexOf(this.tab());
    const next = { ArrowRight: (current + 1) % order.length, ArrowLeft: (current + order.length - 1) % order.length, Home: 0, End: order.length - 1 }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    this.tab.set(order[next]);
    (event.currentTarget as HTMLElement).parentElement?.querySelector<HTMLElement>(`#trip-tab-${order[next]}`)?.focus();
  }
}
