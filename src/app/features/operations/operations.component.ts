import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AccessPolicy } from '../../core/auth/access-policy';
import { OrganizationContext } from '../../core/org/organization-context';
import { DedupFilter, OperationTrip, OperationsView } from '../../domain/models/operations';
import { CursorPagerComponent } from '../../shared/ui/cursor-pager.component';
import { PageHeroComponent } from '../../shared/ui/page-hero.component';
import { PeriodSelectorComponent } from '../dashboard/period-selector.component';
import { FUEL_OPTIONS } from '../vehicles/vehicles.labels';
import { OPERATIONS_PAGE_SIZES, OperationsFacade, SEARCH_MAX_LENGTH, StatusFilter, VIEWS } from './operations.facade';
import { DEDUP_OPTIONS, STATUS_OPTIONS, VIEW_LABELS, countText, dayText, detailErrorText, listErrorText, distanceText, fuelText, kgText, routePlaces, routeText, splitPlace, sharedTone, statusTone, tonsText } from './operations.view';
import { BulkCompletionComponent } from './bulk-completion.component';
import { BulkCompletionFacade } from './bulk-completion.facade';
import { OperationExportsComponent } from './operation-exports.component';
import { TripCompletionComponent } from './trip-completion.component';
import { TripCompletionFacade } from './trip-completion.facade';
import { TripDetailPanelComponent } from './trip-detail-panel.component';

const ICONS = {
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  filter: 'M3 5h18l-7 8v6l-4 2v-8z',
  download: 'M12 4v11M7 11l5 5 5-5M4 20h16',
  truck: 'M2 6h12v10H2zM14 9h4l3 3v4h-7zM5 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M16 19.5a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0',
  clear: 'M6 6l12 12M18 6L6 18',
} as const;

/**
 * «Operaciones logísticas»: los viajes de la empresa con navegación por cursor (Anterior/Siguiente, total acotado «10.000+»), pestañas con conteos,
 * filtros que viven en la URL, búsqueda con espera de 300 ms y un panel de detalle que se pide solo al abrir un viaje. Muestra lo que el servidor
 * guardó: ningún cálculo ambiental pasa por aquí. Exportar descarga un Excel profesional con los mismos filtros y pestaña (lo genera el servidor).
 */
@Component({
  selector: 'app-operations',
  imports: [BulkCompletionComponent, OperationExportsComponent, TripCompletionComponent, PageHeroComponent, PeriodSelectorComponent, CursorPagerComponent, TripDetailPanelComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .page { display: grid; gap: 10px; margin-block: -8px -12px; }
      .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; }
      .top app-page-hero { flex: 1 1 520px; min-width: 0; }
      .bar { flex: 0 0 250px; }
      .card { min-width: 0; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 10px 30px color-mix(in srgb, var(--c-head) 14%, transparent); }
      .filters { display: grid; gap: 8px; padding: 10px 12px; }
      .vtabs { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 4px; padding: 3px; border-radius: 12px; background: var(--c-s3); }
      .vtab { all: unset; box-sizing: border-box; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 34px; padding: 0 12px; border-radius: 9px; font-size: 0.9rem; font-weight: 650; white-space: nowrap; color: var(--c-text2); cursor: pointer; transition: background-color 0.15s, color 0.15s, box-shadow 0.15s; }
      .vtab:hover { background: color-mix(in srgb, var(--c-sf) 80%, transparent); }
      .vtab[aria-selected='true'] { background: var(--c-sf); color: var(--c-accent); box-shadow: 0 1px 3px color-mix(in srgb, var(--c-head) 14%, transparent), inset 0 -2px 0 var(--c-primary); }
      .vtab:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .vtab .n { min-width: 28px; padding: 1px 8px; border-radius: 999px; background: color-mix(in srgb, var(--c-head) 14%, var(--c-sf)); font-size: 0.76rem; font-weight: 700; text-align: center; font-variant-numeric: tabular-nums; color: var(--c-text2); }
      .vtab[aria-selected='true'] .n { background: var(--c-ok-soft); color: var(--c-accent); }
      .vtab .n.pending { display: inline-block; width: 32px; height: 20px; padding: 0; background: var(--c-s3); }
      .row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 12px; }
      .search { min-width: 190px; }
      .search { position: relative; flex: 1 1 170px; min-width: 0; }
      .search > svg { position: absolute; left: 12px; bottom: 11px; width: 18px; height: 18px; color: var(--c-mu); pointer-events: none; }
      .search .input { box-sizing: border-box; padding-left: 38px; padding-right: 38px; }
      .search .x { position: absolute; right: 6px; bottom: 7px; display: grid; place-items: center; width: 26px; height: 26px; border: 0; border-radius: 50%; background: var(--c-s3); color: var(--c-text2); cursor: pointer; }
      .search .x:focus-visible { outline: 3px solid var(--c-focus); }
      .search .x svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
      .cap { display: block; margin-bottom: 2px; font-size: 0.72rem; font-weight: 600; color: var(--c-text2); }
      .field { display: block; flex: 0 0 120px; min-width: 0; }
            .field select { width: 100%; }
      .actions { display: flex; flex: none; gap: 8px; }
      .actions .btn { min-height: 40px; padding: 0 12px; border-radius: var(--radius-sm); white-space: nowrap; }
      .export { display: inline-flex; }
      .export .btn { min-width: 124px; justify-content: center; }
      .spin { width: 16px; height: 16px; border: 2px solid color-mix(in srgb, currentColor 40%, transparent); border-top-color: currentColor; border-radius: 50%; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .ico { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .more { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 10px 12px; padding-top: 10px; border-top: 1px solid var(--c-bd); }
      .more .field { flex-basis: 260px; }
      .hint { margin: 0; font-size: 0.78rem; color: var(--c-mu); }
      @media (max-width: 1100px) { .search { flex-basis: 100%; } .field { flex: 1 1 140px; } .actions { flex: 1 1 100%; } .actions > *, .actions .btn { flex: 1; } .export { display: flex; } }
      .layout { display: grid; gap: 10px; align-items: start; }
      @media (min-width: 1180px) { .layout.with-panel { grid-template-columns: minmax(0, 1fr) 340px; } .layout.with-panel app-trip-detail-panel { position: sticky; top: 72px; } }
      .list { container-type: inline-size; padding: 0 12px; }
      .list.busy { opacity: 0.6; transition: opacity 0.15s; }
      table { width: 100%; table-layout: fixed; border-collapse: collapse; font-size: 0.84rem; }
      th, td { padding: 0 8px; text-align: left; }
      thead th { height: 38px; border-bottom: 1px solid var(--c-bd); background: var(--c-s2); font-size: 0.76rem; font-weight: 700; line-height: 1.2; white-space: nowrap; color: var(--c-mute2); }
      thead th:first-child, td:first-child { padding-left: 12px; }
      thead th:last-child, td:last-child { padding-right: 12px; }
      th.c-date { width: 92px; } th.plate { width: 82px; } th.c-dist { width: 100px; } th.c-cargo { width: 84px; } th.c-fuel { width: 100px; } th.kgh { width: 134px; color: var(--c-head); } th.stateh { width: 156px; } th.acth { width: 52px; }
      td { height: 44px; border-bottom: 1px solid color-mix(in srgb, var(--c-bd) 40%, transparent); vertical-align: middle; color: var(--c-head); transition: background-color 0.15s; }
      tbody tr:last-child td { border-bottom-color: transparent; }
      td:first-child { box-shadow: inset 3px 0 0 transparent; }
      tr.sel td { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); }
      tr.sel td:first-child { box-shadow: inset 3px 0 0 var(--c-primary); }
      tbody tr:hover td { background: var(--c-row-hover); }
      .num { font-variant-numeric: tabular-nums; }
      th.num, td.num, th.c-fuel, td.c-fuel, th.stateh, td.stateCell, th.acth, td.act { text-align: center; }
      td.plate { font-weight: 700; white-space: nowrap; }
      td.c-date { white-space: nowrap; color: var(--c-mu); font-variant-numeric: tabular-nums; }
      td.kg { white-space: nowrap; font-weight: 700; font-size: 0.92rem; }
      td.o, td.d, td.route { overflow: hidden; }
      .mun, .dep { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; line-height: 1.2; }
      .mun { font-weight: 600; }
      .dep { font-size: 0.78rem; color: var(--c-mu); }
      .arrow { color: var(--c-primary); font-weight: 700; margin-right: 4px; }
      .c-merged { display: none; }
      .state { display: grid; justify-items: center; gap: 4px; }
      .chip { display: inline-flex; align-items: center; gap: 6px; padding: 2px 10px; border-radius: 999px; font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
      .chip::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: currentColor; }
      .chip.success { background: var(--c-success-bg); color: var(--c-success); }
      .chip.warning { background: var(--c-warning-bg); color: var(--c-warning); }
      .chip.danger { background: var(--c-danger-bg); color: var(--c-danger); }
      .chip.info { background: var(--c-info-bg); color: var(--c-info); }
      .chip.small { font-size: 0.68rem; padding: 0 8px; }
      .eye { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); color: var(--c-head); cursor: pointer; transition: background-color 0.15s, border-color 0.15s; }
      .eye:hover { background: var(--c-s2); border-color: var(--c-primary); }
      .eye:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .skel i { display: block; height: 12px; border-radius: 6px; background: linear-gradient(90deg, var(--c-s3) 25%, var(--c-s2) 50%, var(--c-s3) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
      @keyframes shimmer { to { background-position: -200% 0; } }
      .empty { display: grid; justify-items: center; gap: 6px; padding: 44px 16px; text-align: center; }
      .empty h2 { margin: 0; font-size: 1.05rem; color: var(--c-head); }
      .empty p { margin: 0; color: var(--c-text2); font-size: 0.9rem; }
      .empty svg { width: 40px; height: 40px; fill: none; stroke: var(--c-primary); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .filters .alert { margin: 0; }
      .alert { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; margin: 16px; }
      app-cursor-pager { display: block; padding: 0 12px 6px; }
      .lbl { display: none; }
      /* Con poco ancho (p. ej. con el panel de detalle abierto) se esconden primero Carga y Combustible, luego Distancia (el trayecto pasa a una sola columna de dos líneas) y por último Fecha; todo sigue en el detalle. Con menos de 480 px, cada viaje es una tarjeta de tres líneas. */
      @container (max-width: 999px) { .c-cargo { display: none; } }
      @container (max-width: 919px) { .c-fuel { display: none; } }
      @container (max-width: 799px) { .c-dist, .c-split { display: none; } .c-merged { display: table-cell; } th.plate { width: 76px; } th.kgh { width: 100px; white-space: normal; } th.stateh { width: 150px; } th.acth { width: 48px; } }
      @container (max-width: 619px) { .c-date { display: none; } }
      @container (max-width: 479px) {
        table, thead, tbody, tr, td { display: block; }
        thead { position: absolute; width: 1px; height: 1px; overflow: clip; clip-path: inset(50%); }
        .c-cargo, .c-split { display: none; }
        .c-fuel, .c-dist, .c-date, .c-merged { display: block; }
        tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 44px; grid-template-areas: 'date state state state' 'plate route route route' 'dist fuel kg act'; align-items: center; gap: 6px 10px; padding: 12px 8px; border-bottom: 1px solid var(--c-bd); }
        td, td:first-child { height: auto; padding: 0; border: 0; box-shadow: none; }
        td.c-date { grid-area: date; } td.stateCell { grid-area: state; justify-self: end; } td.plate { grid-area: plate; } td.route { grid-area: route; }
        td.dist { grid-area: dist; } td.c-fuel { grid-area: fuel; } td.kg { grid-area: kg; } td.act { grid-area: act; justify-self: end; }
        td.dist, td.c-fuel, td.kg, td.num, td.stateCell, td.act { text-align: left; }
        .state { justify-items: end; }
        td.dist .lbl, td.c-fuel .lbl, td.kg .lbl { display: block; font-size: 0.7rem; font-weight: 600; color: var(--c-mu); }
        td.c-date .lbl, td.plate .lbl, td.route .lbl, td.stateCell .lbl { position: absolute; width: 1px; height: 1px; overflow: clip; clip-path: inset(50%); display: block; }
        .mun, .dep { display: inline; white-space: normal; }
        .eye { width: 44px; height: 44px; }
        tr.sel td, tbody tr:hover td { background: none; }  /* en tarjeta el fondo va en la fila, no en cada celda */
        tr.sel { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); box-shadow: inset 3px 0 0 var(--c-primary); }
        tbody tr { padding-inline: 8px; }
        tr.skel { display: grid; grid-template-areas: none; }
        tr.skel td { height: 12px; }
      }
      @media (prefers-reduced-motion: reduce) { .skel i, .spin { animation: none; } .list.busy, .vtab, td, .eye { transition: none; } }
    `,
  ],
  template: `
    <div class="page">
      <div class="top">
        <app-page-hero [dense]="true" [art]="false" title="Operaciones logísticas" subtitle="Consulta los viajes registrados, su información operacional y las emisiones de CO₂." />
        @if (canSeeImports()) {
          <div class="bar"><app-period-selector data-testid="period" [periods]="facade.periods.data() ?? []" [selection]="facade.period()" [status]="facade.periods.status()" [link]="null" (selected)="facade.setPeriod($event)" (retry)="facade.load()" /></div>
        }
      </div>

      <section class="card filters" aria-label="Filtros de los viajes">
        <div class="vtabs" role="tablist" aria-label="Estado de los viajes" data-testid="view-tabs">
          @for (v of views; track v) {
            <button type="button" class="vtab" role="tab" id="ops-tab-{{ v }}" aria-controls="ops-results" [attr.data-testid]="'view-' + v" [attr.aria-selected]="facade.view() === v" [attr.tabindex]="facade.view() === v ? 0 : -1" (click)="facade.setView(v)" (keydown)="onViewKey($event)">
              {{ labels[v] }}
              @if (facade.summary.data(); as counts) { <span class="n" [attr.data-testid]="'count-' + v">{{ countOf(counts[v]) }}</span> } @else { <span class="n pending" aria-hidden="true"></span> }
            </button>
          }
        </div>

        <form class="row" role="search" (submit)="$event.preventDefault()">
          <div class="search">
            <label class="cap" for="ops-search">Buscar</label>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path [attr.d]="icons.search" /></svg>
            <input id="ops-search" class="input" type="search" aria-label="Buscar viajes" placeholder="ID, placa, origen o destino" autocomplete="off" data-testid="search" [attr.maxlength]="maxSearch" [value]="facade.searchText()" (input)="onSearch($event)" />
            @if (facade.searchText()) { <button type="button" class="x" aria-label="Borrar la búsqueda" data-testid="clear-search" (click)="facade.clearSearch()"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.clear" /></svg></button> }
          </div>
          <label class="field"><span class="cap">Combustible</span>
            <select class="input" data-testid="fuel" (change)="facade.setFuel(value($event) || null)">
              <option value="" [selected]="!facade.fuel()">Todos</option>
              @for (f of fuels; track f.value) { <option [value]="f.value" [selected]="f.value === facade.fuel()">{{ f.label }}</option> }
            </select>
          </label>
          <label class="field"><span class="cap">Estado</span>
            <select class="input" data-testid="status" (change)="onStatus($event)">
              <option value="" [selected]="!facade.status()">Todos</option>
              @for (s of statuses; track s.value) { <option [value]="s.value" [selected]="s.value === facade.status()">{{ s.label }}</option> }
            </select>
          </label>
          @if (canSeeImports()) {
            <label class="field"><span class="cap">Archivo de carga</span>
              <select class="input" data-testid="import-file" (change)="facade.setImportFile(value($event) || null)">
                <option value="" [selected]="!facade.importFileId()">Todos</option>
                @for (f of importFileOptions(); track f.id) { <option [value]="f.id" [selected]="f.id === facade.importFileId()">{{ f.fileName }}</option> }
              </select>
            </label>
          }
          <div class="actions">
          <button type="button" class="btn btn-secondary" data-testid="more-filters" aria-controls="ops-more" [attr.aria-expanded]="moreOpen()" (click)="toggleMore()"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.filter" /></svg>Más filtros</button>
          <span class="export"><button type="button" class="btn btn-secondary" [disabled]="!facade.canExport() || facade.exporting()" [attr.aria-busy]="facade.exporting()" [attr.aria-describedby]="facade.canExport() ? null : 'ops-export-hint'" data-testid="export" (click)="facade.exportReport()">@if (facade.exporting()) { <span class="spin" aria-hidden="true"></span>Preparando… } @else { <svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.download" /></svg>Exportar }</button>@if (!facade.canExport()) { <small class="sr-only" id="ops-export-hint" data-testid="export-hint">No hay viajes para exportar con los filtros actuales</small> }</span>
          <app-operation-exports />
          </div>
        </form>

        @if (moreOpen()) {
          <div class="more" id="ops-more" data-testid="more-panel">
            <label class="field"><span class="cap">Duplicados</span>
              <select class="input" data-testid="dedup" (change)="facade.setDedup(dedupValue($event))">
                @for (d of dedups; track d.value) { <option [value]="d.value" [selected]="d.value === facade.dedup()">{{ d.label }}</option> }
              </select>
            </label>
            <p class="hint">Los duplicados y los retenidos se muestran con su estado y nunca suman en los totales ni en las emisiones.</p>
          </div>
        }
        @if (facade.exportOffer(); as offer) {
          <div class="alert" role="alert" data-testid="export-offer"><div>{{ offer.maxRows ? 'El reporte tiene más de ' + countOf({ value: offer.maxRows, capped: false }) + ' viajes. ¿Generarlo en segundo plano?' : 'El reporte tiene demasiados viajes para descargarlo directamente. ¿Generarlo en segundo plano?' }}</div><button type="button" class="btn btn-primary btn-sm" data-testid="export-generate" (click)="facade.generateReport()">Generar reporte</button></div>
        }
        @if (facade.exportError(); as failure) {
          <div class="alert alert-danger" role="alert" data-testid="export-error"><div>{{ failure.message }}</div></div>
        }
        @if (searchHint()) { <p class="hint" role="status" data-testid="search-hint">Escribe al menos 2 caracteres para buscar.</p> }
      </section>

      <div class="layout" [class.with-panel]="!!facade.selectedId()">
        <section class="card" id="ops-results" role="tabpanel" [attr.aria-labelledby]="'ops-tab-' + facade.view()" aria-label="Viajes" [attr.aria-busy]="facade.refreshing() || facade.list.status() === 'loading'" data-testid="results">
          @if (facade.list.status() === 'error') {
            <div class="alert alert-danger" role="alert" data-testid="list-error"><div>{{ listError() }}</div><button type="button" class="btn btn-secondary btn-sm" data-testid="retry" (click)="facade.retry()">Reintentar</button></div>
          } @else {
            <div class="list" [class.busy]="facade.refreshing() && !!facade.list.data()" data-testid="trip-list">
              <table data-testid="trips-table" role="table">
                <caption class="sr-only">Viajes de la empresa</caption>
                <thead role="rowgroup">
                  <tr role="row">
                    <th role="columnheader" scope="col" class="c-date">Fecha</th><th role="columnheader" scope="col" class="plate">Placa</th>
                    <th role="columnheader" scope="col" class="c-split">Origen</th><th role="columnheader" scope="col" class="c-split">Destino</th><th role="columnheader" scope="col" class="c-merged">Origen → Destino</th>
                    <th role="columnheader" scope="col" class="num c-dist">Distancia (km)</th><th role="columnheader" scope="col" class="num c-cargo">Carga (t)</th><th role="columnheader" scope="col" class="c-fuel">Combustible</th>
                    <th role="columnheader" scope="col" class="num kgh">Emisiones (kg CO₂)</th><th role="columnheader" scope="col" class="stateh">Estado</th><th role="columnheader" scope="col" class="acth"><span class="sr-only">Acciones</span></th>
                  </tr>
                </thead>
                <tbody role="rowgroup">
                  @if (!facade.list.data()) {
                    @for (n of skeletonRows(); track n) { <tr class="skel" role="row" aria-hidden="true" data-testid="skeleton-row">@for (w of skeletonCells; track $index) { <td role="cell" [class.c-date]="$index === 0" [class.plate]="$index === 1" [class.c-split]="$index === 2 || $index === 3" [class.c-merged]="$index === 4" [class.c-dist]="$index === 5" [class.c-cargo]="$index === 6" [class.c-fuel]="$index === 7"><i [style.width.%]="w"></i></td> }</tr> }
                  } @else {
                    @for (t of facade.items(); track t.id) {
                      <tr role="row" [class.sel]="t.id === facade.selectedId()" [attr.aria-current]="t.id === facade.selectedId() ? 'true' : null" [attr.aria-label]="'Viaje ' + (t.tripId ?? t.plate ?? '')" data-testid="trip-row">
                        <td role="cell" class="c-date"><span class="lbl">Fecha</span>{{ day(t.tripDate) }}</td>
                        <td role="cell" class="plate"><span class="lbl">Placa</span>{{ t.plate ?? '—' }}</td>
                        <td role="cell" class="o c-split" data-testid="origin">@let o = split(places(t)[0]);<span class="mun" [attr.title]="places(t)[0]">{{ o[0] }}</span>{{ ' ' }}<span class="dep">{{ o[1] }}</span></td>
                        <td role="cell" class="d c-split" data-testid="destination">@let d = split(places(t)[1]);<span class="mun" [attr.title]="places(t)[1]">{{ d[0] }}</span>{{ ' ' }}<span class="dep">{{ d[1] }}</span></td>
                        <td role="cell" class="route c-merged"><span class="lbl">Origen → Destino</span>
                          <span class="mun" [attr.title]="pathOf(t)">{{ places(t)[0] }}</span>{{ ' ' }}
                          <span class="dep"><span class="arrow" aria-hidden="true">→</span>{{ ' ' }}{{ places(t)[1] }}</span></td>
                        <td role="cell" class="num dist c-dist"><span class="lbl">Distancia (km)</span>{{ km(t.distanceKm) }}</td>
                        <td role="cell" class="num c-cargo"><span class="lbl">Carga (t)</span>{{ tons(t.cargoTon) }}</td>
                        <td role="cell" class="c-fuel"><span class="lbl">Combustible</span>{{ fuel(t.fuelType) }}</td>
                        <td role="cell" class="num kg"><span class="lbl">Emisiones (kg CO₂)</span>{{ kg(t.kgCo2) }}</td>
                        <td role="cell" class="stateCell"><span class="lbl">Estado</span>
                          <span class="state">
                            <span class="chip" [class]="'chip ' + tone(t)" [attr.title]="t.reasonLabel" data-testid="state-chip">{{ t.stateLabel }}</span>
                            @if (t.shared; as s) { <span class="chip small" [class]="'chip small ' + sharedToneOf(s.state)" data-testid="shared-chip">{{ s.label }}</span> }
                          </span>
                        </td>
                        <td role="cell" class="act"><button type="button" class="eye" data-testid="open-detail" [attr.aria-label]="'Ver el detalle del viaje ' + (t.tripId ?? t.plate ?? '')" aria-controls="trip-detail-title" (click)="open(t, $event)"><svg class="ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.eye" /></svg></button></td>
                      </tr>
                    }
                  }
                </tbody>
              </table>
              @if (facade.list.data() && facade.items().length === 0) {
                <div class="empty" data-testid="empty-state">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="facade.hasFilters() || facade.view() !== 'all' ? icons.search : icons.truck" /></svg>
                  @if (facade.hasFilters() || facade.view() !== 'all') {
                    <h2>Sin resultados</h2><p>Ningún viaje coincide con los filtros elegidos.</p>
                    <button type="button" class="btn btn-secondary btn-sm" data-testid="clear-filters" (click)="facade.clearFilters()">Limpiar filtros</button>
                  } @else {
                    <h2>Aún no hay viajes</h2><p>Cuando cargues un archivo con viajes, aparecerán aquí con su estado y sus emisiones.</p>
                  }
                </div>
              }
            </div>
            @if (facade.items().length > 0) {
              <app-cursor-pager [from]="facade.from()" [to]="facade.to()" [totalLabel]="totalLabel()" [pageSize]="facade.pageSize()" [sizes]="sizes" [hasPrevious]="facade.hasPrevious()" [hasNext]="facade.hasNext()" [busy]="facade.refreshing()" [keepFocus]="true" (previous)="facade.previous()" (next)="facade.next()" (sizeChange)="facade.setPageSize($event)">
                @if (bulk.available() && facade.view() === 'pending') { <app-bulk-completion /> }
              </app-cursor-pager>
            }
          }
        </section>

        @if (facade.selectedId()) {
          <app-trip-detail-panel #panel [trip]="selectedRow()" [detail]="facade.detail.data()" [status]="facade.detail.status()" [errorMessage]="detailError()" [canComplete]="completion.canComplete()" [editing]="completion.mode() !== 'idle'" [refusal]="refusalText()" (closed)="close()" (retry)="facade.retryDetail()" (completeRequested)="startCompletion()">
            @if (completion.mode() !== 'idle') {
              <app-trip-completion completion [mode]="completion.mode()" [state]="completion.state.data()" [status]="completion.state.status()" [loadError]="completion.state.error()" [values]="completion.values()" [errors]="completion.fieldErrors()" [saving]="completion.saving()" [error]="completion.error()" [notice]="completion.notice()" [outcome]="completion.outcome()" [hasValues]="completion.hasValues()" [canNext]="!!completion.nextPending()" (changed)="completion.setValue($event.name, $event.value)" (save)="completion.save()" (saveNext)="completion.save(true)" (dismissed)="stopCompletion()" (finished)="finishCompletion()" (next)="nextCompletion()" (continue)="completion.continueEditing()" (retry)="startCompletion()" />
            }
          </app-trip-detail-panel>
        }
      </div>
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="completion-live">{{ completion.announcement() }}</span>
    </div>
  `,
})
export class OperationsComponent {
  protected readonly facade = inject(OperationsFacade);
  protected readonly completion = inject(TripCompletionFacade);
  protected readonly bulk = inject(BulkCompletionFacade);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly panel = viewChild<TripDetailPanelComponent>('panel');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private opener: Element | null = null;

  protected readonly icons = ICONS;
  protected readonly views = VIEWS;
  protected readonly labels = VIEW_LABELS;
  protected readonly fuels = FUEL_OPTIONS;
  protected readonly statuses = STATUS_OPTIONS;
  protected readonly dedups = DEDUP_OPTIONS;
  protected readonly sizes = OPERATIONS_PAGE_SIZES;
  protected readonly maxSearch = SEARCH_MAX_LENGTH;
  protected readonly skeletonRows = computed(() => Array.from({ length: this.facade.pageSize() }, (_, i) => i + 1));
  protected readonly skeletonCells = [60, 50, 70, 70, 85, 45, 40, 55, 50, 70, 30];
  protected readonly canSeeImports = computed(() => this.access.can('imports:create'));
  private readonly moreToggled = signal(false);
  protected readonly moreOpen = computed(() => this.moreToggled() || this.facade.dedup() !== 'counted');
  /** Cuando hay un solo carácter escrito: no se busca todavía y se le dice por qué. */
  protected readonly searchHint = computed(() => this.facade.searchText().trim().length === 1);
  protected readonly listError = computed(() => listErrorText(this.facade.list.error()));
  protected readonly refusalText = computed(() => {
    const refusal = this.completion.refusal();

    return refusal && refusal.tripId === this.facade.selectedId() ? refusal.message : null;
  });
  protected readonly detailError = computed(() => (this.facade.detail.error() ? detailErrorText(this.facade.detail.error()) : null));
  protected readonly totalLabel = computed(() => countText(this.facade.total()));
  protected readonly selectedRow = computed<OperationTrip | null>(() => this.facade.items().find((t) => t.id === this.facade.selectedId()) ?? null);
  /** Las cargas ya completadas que se ofrecen; si la URL trae una que no está en la lista, igual se mantiene elegida. */
  protected readonly importFileOptions = computed(() => {
    const files = (this.facade.importFiles.data() ?? []).map((f) => ({ id: f.id, fileName: f.fileName }));
    const chosen = this.facade.importFileId();

    return chosen && !files.some((f) => f.id === chosen) ? [{ id: chosen, fileName: 'Archivo seleccionado' }, ...files] : files;
  });

  protected readonly day = dayText;
  protected readonly km = distanceText;
  protected readonly tons = tonsText;
  protected readonly kg = kgText;
  protected readonly fuel = fuelText;
  protected readonly sharedToneOf = sharedTone;
  protected readonly tone = (t: OperationTrip): string => statusTone(t.status);
  protected readonly split = splitPlace;
  protected readonly places = (t: OperationTrip): readonly [string, string] => routePlaces(t.origin, t.destination);
  protected readonly pathOf = (t: OperationTrip): string => routeText(t.origin, t.destination);
  protected readonly countOf = countText;

  constructor() {
    // Los filtros de la URL mandan al entrar (recargar o volver conserva la vista); las páginas (cursores) no van en la URL.
    this.facade.restore(this.route.snapshot.queryParamMap);

    // El estado vive en un facade de raíz: al salir de la pantalla una descarga directa a medias se cancela (si no, el archivo se guardaría en silencio después).
    inject(DestroyRef).onDestroy(() => this.facade.cancelExport());

    // Carga al entrar y al cambiar de empresa.
    effect(() => {
      this.context.activeOrganizationId();
      untracked(() => this.facade.load());
    });

    // Un viaje por completar o bloqueado que no se puede completar muestra el motivo del servidor con su guía (solo con permiso).
    effect(() => {
      const detail = this.facade.detail.status() === 'ready' ? this.facade.detail.data() : null;

      untracked(() => this.completion.inspect(detail));
    });

    // La URL sigue al estado de la vista, sin añadir entradas al historial.
    effect(() => {
      const queryParams = this.facade.urlParams();

      untracked(() => void this.router.navigate([], { relativeTo: this.route, queryParams, queryParamsHandling: 'merge', replaceUrl: true }));
    });
  }

  protected value(event: Event): string {
    return (event.target as HTMLSelectElement).value;
  }

  protected dedupValue(event: Event): DedupFilter {
    return this.value(event) as DedupFilter;
  }

  protected onStatus(event: Event): void {
    this.facade.setStatus((this.value(event) || null) as StatusFilter | null);
  }

  protected onSearch(event: Event): void {
    this.facade.setSearchText((event.target as HTMLInputElement).value);
  }

  protected toggleMore(): void {
    // Con un filtro de duplicados activo el panel no se puede cerrar: ocultaría un criterio vigente.
    if (this.facade.dedup() === 'counted') this.moreToggled.update((open) => !open);
  }

  protected open(trip: OperationTrip, event: Event): void {
    this.opener = event.currentTarget as Element;
    this.completion.cancel();
    this.facade.open(trip.id);
    setTimeout(() => this.panel()?.focusTitle());
  }

  protected startCompletion(): void {
    const id = this.facade.selectedId();

    if (id) this.completion.start(id);
  }

  /** «Cancelar» y «Cerrar»: vuelve al detalle y el foco a «Completar datos». */
  protected stopCompletion(): void {
    this.completion.cancel();
    setTimeout(() => this.panel()?.focusAction());
  }

  protected finishCompletion(): void {
    this.completion.finish();
    setTimeout(() => this.panel()?.focusAction());
  }

  /** Desde el resultado: abre el siguiente viaje por completar de la página (el formulario se abre solo). */
  protected nextCompletion(): void {
    const next = this.completion.nextPending();

    if (!next) return;

    this.facade.detail.reset();
    this.facade.open(next);
    this.completion.start(next, true);
  }

  protected close(): void {
    this.completion.cancel();
    this.facade.close();
    // Si la fila que abrió el detalle ya no está (cambió la página o el filtro), el foco no se pierde: va al buscador.
    const opener = this.opener as HTMLElement | null;
    const target = opener?.isConnected ? opener : this.host.nativeElement.querySelector<HTMLElement>('[data-testid="search"]');

    target?.focus?.();
    this.opener = null;
  }

  /** Flechas, Inicio y Fin cambian de pestaña y llevan el foco a la elegida. */
  protected onViewKey(event: KeyboardEvent): void {
    const order: readonly OperationsView[] = VIEWS;
    const current = order.indexOf(this.facade.view());
    const next = { ArrowRight: (current + 1) % order.length, ArrowLeft: (current + order.length - 1) % order.length, Home: 0, End: order.length - 1 }[event.key];

    if (next === undefined) return;

    event.preventDefault();
    this.facade.setView(order[next]);
    this.host.nativeElement.querySelector<HTMLElement>(`#ops-tab-${order[next]}`)?.focus();
  }
}
