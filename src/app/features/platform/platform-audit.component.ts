import { DOCUMENT, DatePipe, Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { ActivatedRoute, ParamMap } from '@angular/router';
import { ActivityItem, AuditCategory, AuditChannel, AuditFilter } from '../../domain/models/platform-admin';
import { DIRECTORY_STYLES } from '../../shared/ui/directory.styles';
import { MEMBERSHIP_LABELS, roleLabel } from '../../shared/ui/labels';
import { CURSOR_PAGE_SIZES, CursorPagerComponent } from '../../shared/ui/cursor-pager.component';
import { activityText, relativeTime } from './platform-labels';
import { PlatformActivityFacade } from './platform.facades';

type Period = '7' | '30' | '90' | 'all' | 'range';

const PERIODS: readonly { value: Period; label: string; url: string }[] = [
  { value: '7', label: 'Últimos 7 días', url: '7' }, { value: '30', label: 'Últimos 30 días', url: '' }, { value: '90', label: 'Últimos 90 días', url: '90' },
  { value: 'all', label: 'Todo el historial', url: 'todo' }, { value: 'range', label: 'Rango de fechas…', url: 'rango' },
];
const CATEGORIES: readonly { value: AuditCategory; label: string }[] = [
  { value: 'organizations', label: 'Empresas' }, { value: 'access', label: 'Accesos de personas' }, { value: 'invitations', label: 'Invitaciones' },
  { value: 'super_admins', label: 'Superadministradores' }, { value: 'relationships', label: 'Relaciones comerciales' },
];
const CHANNELS: readonly { value: AuditChannel; label: string }[] = [{ value: 'console', label: 'Consola web' }, { value: 'operator', label: 'Operador (recuperación)' }];
/** Rótulos de los metadatos permitidos que el servidor entrega al abrir un evento. */
const METADATA_LABELS: Readonly<Record<string, string>> = {
  role: 'Rol', role_code: 'Rol', to_status: 'Nuevo estado', from_status: 'Estado anterior', status: 'Estado', fields: 'Campos modificados',
  before: 'Antes', after: 'Después', changes: 'Cambios', invitee: 'Persona invitada', users_deleted: 'Personas eliminadas', expires_at: 'Vence',
};
const COUNT = new Intl.NumberFormat('es-CO');
const SEARCH_DEBOUNCE_MS = 350;
const SIZE_KEY = 'logyco2.platform.audit.pageSize';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function storedSize(): number {
  try {
    const size = Number(localStorage.getItem(SIZE_KEY));
    return CURSOR_PAGE_SIZES.includes(size) ? size : 25;
  } catch {
    return 25;
  }
}

/** Los códigos que la persona reconoce (estado de la membresía, rol) salen con su rótulo; el resto, tal cual. */
function displayValue(key: string, value: unknown): string {
  if (typeof value === 'string' && ['to_status', 'from_status', 'status'].includes(key)) return (MEMBERSHIP_LABELS as Readonly<Record<string, { text: string }>>)[value]?.text ?? value;
  if (typeof value === 'string' && ['role', 'role_code'].includes(key)) return roleLabel(value);

  return formatValue(value);
}

function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(formatValue).join(', ');
  if (value && typeof value === 'object') return Object.entries(value).map(([key, inner]) => `${key}: ${formatValue(inner)}`).join('; ');

  return value === null || value === undefined ? '—' : String(value);
}

/** Actividad administrativa REAL: solo lo que quedó registrado en la auditoría persistente, con filtros y páginas del servidor. */
@Component({
  selector: 'app-platform-audit',
  imports: [DatePipe, CursorPagerComponent],
  host: { '(document:keydown.escape)': 'closeEvent()' },
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    DIRECTORY_STYLES,
    `
      :host { display: block; min-width: 0; }
      .toolbar .search { flex-basis: 300px; }
      .toolbar .type-filter { flex: 0 1 190px; }
      .toolbar .period-filter { flex: 0 1 190px; }
      .date { display: inline-flex; align-items: center; gap: 8px; color: var(--c-mu); font-size: 0.82rem; font-weight: 600; }
      .date .input { width: auto; min-height: 40px; border-radius: 10px; }
      .range-error { flex-basis: 100%; margin: 0; color: var(--c-danger); font-size: 0.8rem; font-weight: 600; }
      .company-tag { display: inline-flex; align-items: center; gap: 6px; padding: 5px 6px 5px 12px; border-radius: 999px; background: var(--c-ok-soft); color: var(--c-accent); font-size: 0.78rem; font-weight: 650; }
      .company-tag button { display: grid; place-items: center; width: 20px; height: 20px; border: 0; border-radius: 50%; background: var(--c-ok-soft); color: var(--c-accent); font-size: 0.95rem; line-height: 1; cursor: pointer; }
      .company-tag button:focus-visible { outline: 2px solid var(--c-primary); }
      .dt table { width: 100%; min-width: 700px; table-layout: fixed; border-collapse: separate; border-spacing: 0; }
      .dt .c-when { width: 190px; } .dt .c-org { width: 220px; }
      .dt tbody tr { height: 56px; cursor: pointer; }
      .dt tbody tr:focus-visible { outline: 3px solid var(--c-secondary-soft); outline-offset: -3px; }
      .dt tbody tr:hover th { box-shadow: none; }
      /* Cabecera y celdas comparten alineación por columna: texto a la izquierda, origen centrado. */
      .dt thead th.c-left > span { justify-content: flex-start; text-align: left; }
      .dt td.c-left { text-align: left; }
      .dt td.c-left:last-child { padding-inline: 16px; }
      .dt td.c-what { overflow-wrap: anywhere; color: var(--c-gray-900); font-size: 0.92rem; font-weight: 500; }
      .dt td.c-when, .dt td.c-org { color: var(--c-gray-900); font-size: 0.88rem; }
      .when-rel { color: var(--c-mu); font-size: 0.74rem; display: block; }
      .dt td.c-what .badge { margin-left: 8px; vertical-align: 1px; }
      .tone { display: inline-block; width: 9px; height: 9px; margin-right: 10px; border-radius: 50%; background: var(--c-info); }
      .tone.success { background: var(--c-primary); } .tone.warning { background: var(--c-dot-warning); } .tone.danger { background: var(--c-danger); }
      .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 18px; margin: 0; padding: 10px 16px; list-style: none; border-bottom: 1px solid var(--c-bd); background: var(--c-sf); color: var(--c-mu); font-size: 0.8rem; }
      .legend li { display: inline-flex; align-items: center; }
      .legend .tone { margin-right: 7px; }
      .drawer-backdrop { position: fixed; inset: 0; z-index: 80; background: color-mix(in srgb, var(--c-gray) 38%, transparent); }
      .drawer { position: fixed; top: 0; right: 0; bottom: 0; z-index: 81; display: flex; flex-direction: column; gap: 14px; width: min(440px, 100vw); box-sizing: border-box; padding: 20px 22px; overflow: auto; background: var(--c-sf); border-left: 1px solid var(--c-bd); box-shadow: -12px 0 32px color-mix(in srgb, var(--c-gray) 18%, transparent); }
      .drawer header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .drawer h2 { margin: 0; font-size: 1.05rem; }
      .drawer .x { display: grid; place-items: center; width: 34px; height: 34px; border: 1px solid var(--c-bd); border-radius: 9px; background: var(--c-sf); color: var(--c-head); font-size: 1.1rem; cursor: pointer; }
      .drawer .x:focus-visible { outline: 3px solid var(--c-secondary-soft); }
      .drawer .what { margin: 0; font-size: 1rem; font-weight: 600; color: var(--c-gray-900); }
      .drawer dl { display: grid; grid-template-columns: 130px minmax(0, 1fr); gap: 8px 14px; margin: 0; font-size: 0.86rem; }
      .drawer dt { color: var(--c-mu); }
      .drawer dd { margin: 0; overflow-wrap: anywhere; color: var(--c-gray-900); }
      .drawer h3 { margin: 6px 0 0; font-size: 0.9rem; }
      .empty-state { display: flex; flex-direction: column; align-items: center; gap: 8px; padding: 40px 20px; text-align: center; }
      .empty-state svg { width: 36px; height: 36px; fill: none; stroke: var(--c-primary); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .empty-state h2 { margin: 0; }
      .empty-state p { margin: 0; }
    `,
  ],
  template: `
    <div class="page">
      <header class="page-header">
        <div class="head">
          <span class="head-ico" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="icons.log" /></svg></span>
          <div><h1>Actividad y auditoría</h1><p>Acciones administrativas registradas: quién hizo qué y cuándo. No se muestran contraseñas, tokens ni códigos.</p></div>
        </div>
      </header>

      <div class="directory">
        <form class="toolbar" role="search" (submit)="$event.preventDefault()">
          <div class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.search" /></svg>
            <input id="audit-q" class="input" type="search" aria-label="Buscar en la auditoría" placeholder="Buscar por persona, empresa o acción" autocomplete="off" data-testid="audit-search" [value]="search()" (input)="onSearch($event)" />
            @if (search()) { <button type="button" class="x" aria-label="Borrar búsqueda" data-testid="clear-search" (click)="clearSearch()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button> }
          </div>
          <select class="input type-filter" aria-label="Tipo de acción" data-testid="category-filter" [value]="category()" (change)="setCategory($event)">
            <option value="">Todas las acciones</option>
            @for (c of categories; track c.value) { <option [value]="c.value" [selected]="c.value === category()">{{ c.label }}</option> }
          </select>
          <select class="input type-filter" aria-label="Origen" data-testid="channel-filter" [value]="channel()" (change)="setChannel($event)">
            <option value="">Registrado desde: todo</option>
            @for (c of channels; track c.value) { <option [value]="c.value" [selected]="c.value === channel()">{{ c.label }}</option> }
          </select>
          <select class="input period-filter" aria-label="Período" data-testid="period-filter" [value]="period()" (change)="setPeriod($event)">
            @for (p of periods; track p.value) { <option [value]="p.value" [selected]="p.value === period()">{{ p.label }}</option> }
          </select>
          @if (period() === 'range') {
            <label class="date">Desde <input type="date" class="input" aria-label="Fecha inicial" data-testid="date-from" [value]="dateFrom()" [attr.max]="dateTo() || null" (change)="setDate('from', $event)" /></label>
            <label class="date">Hasta <input type="date" class="input" aria-label="Fecha final" data-testid="date-to" [value]="dateTo()" [attr.min]="dateFrom() || null" (change)="setDate('to', $event)" /></label>
            @if (rangeInvalid()) { <p class="range-error" role="alert" data-testid="range-error">La fecha inicial debe ser anterior o igual a la final.</p> }
          }
          @if (companyId()) { <span class="company-tag" data-testid="company-tag">Empresa: {{ companyName() }}<button type="button" aria-label="Quitar el filtro de empresa" data-testid="clear-company" (click)="clearCompany()">×</button></span> }
          @if (hasFilters()) { <button type="button" class="btn btn-ghost btn-sm" data-testid="clear-filters" (click)="clearFilters()">Limpiar filtros</button> }
          <span class="result" role="status" [attr.title]="totalLabel() + ' eventos'"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.log" /></svg><b data-testid="audit-total">{{ totalLabel() || '…' }}</b><span class="sr-only"> eventos</span></span>
        </form>

        <ul class="legend" aria-label="Significado de los colores">
          @for (t of tones; track t.tone) { <li><span class="tone" [class.success]="t.tone === 'success'" [class.warning]="t.tone === 'warning'" [class.danger]="t.tone === 'danger'" aria-hidden="true"></span>{{ t.label }}</li> }
        </ul>

        @if (facade.list.status() === 'error' && !facade.list.data()) {
          <div class="alert alert-danger" role="alert"><div>{{ facade.list.error()?.message ?? 'No se pudo cargar la auditoría.' }}</div><button type="button" class="btn btn-secondary btn-sm" (click)="reload()">Reintentar</button></div>
        } @else {
          <section class="dt" tabindex="0" aria-label="Actividad administrativa" [class.busy]="facade.list.status() === 'loading' && !!facade.list.data()" [attr.aria-busy]="facade.list.status() === 'loading'">
            <table data-testid="activity-table">
              <caption class="sr-only">Actividad administrativa</caption>
              <colgroup><col class="c-when" /><col /><col class="c-org" /></colgroup>
              <thead><tr><th scope="col" class="c-when c-left"><span>Cuándo</span></th><th scope="col" class="c-left"><span>Qué ocurrió</span></th><th scope="col" class="c-org c-left"><span>Empresa</span></th></tr></thead>
              <tbody>
                @if (!facade.list.data()) {
                  @for (n of skeletonRows; track n) { <tr class="skel" aria-hidden="true"><td><i style="width: 70%"></i></td><td><i style="width: 80%"></i></td><td><i style="width: 60%"></i></td></tr> }
                } @else {
                  @for (item of items(); track item.id) {
                    <tr tabindex="0" [attr.aria-label]="text(item).title" aria-haspopup="dialog" data-testid="activity-row" (click)="open(item, $event)" (keydown.enter)="open(item, $event)">
                      <td class="c-when c-left" [title]="item.occurredAt | date: 'medium'">{{ item.occurredAt | date: 'short' }}<span class="when-rel">{{ ago(item.occurredAt) }}</span></td>
                      <td class="c-what c-left"><span class="tone" [class.success]="text(item).tone === 'success'" [class.warning]="text(item).tone === 'warning'" [class.danger]="text(item).tone === 'danger'" [attr.title]="toneMeaning(text(item).tone)"></span><span class="sr-only">{{ toneMeaning(text(item).tone) }}: </span>{{ text(item).title }}@if (text(item).detail; as d) { <span class="muted small"> — {{ d }}</span> }@if (item.channel !== 'api') { <span class="badge badge-warning" title="Registrado por un operador desde la herramienta de recuperación, no desde la consola">Operador</span> }</td>
                      <td class="c-left">{{ item.organizationName ?? '—' }}</td>
                    </tr>
                  }
                }
              </tbody>
            </table>
            @if (facade.list.data() && items().length === 0) {
              <div class="empty-state" data-testid="empty-state">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="hasFilters() ? icons.search : icons.log" /></svg>
                @if (hasFilters()) {
                  <h2>Sin resultados</h2><p class="muted">Ningún evento coincide con los filtros.</p>
                  <button type="button" class="btn btn-secondary btn-sm" (click)="clearFilters()">Limpiar filtros</button>
                } @else {
                  <h2>Sin actividad en este período</h2><p class="muted">Las acciones administrativas aparecerán aquí a medida que ocurran.</p>
                }
              </div>
            }
          </section>
          @if (items().length > 0) {
            <app-cursor-pager [from]="from()" [to]="to()" [totalLabel]="totalLabel()" [pageSize]="pageSize()" [hasPrevious]="pageIndex() > 0" [hasNext]="!!facade.list.data()?.hasMore" [busy]="facade.list.status() === 'loading'" (previous)="previous()" (next)="next()" (sizeChange)="setPageSize($event)" />
          }
        }
      </div>
    </div>

    @if (selected(); as event) {
      <div class="drawer-backdrop" (click)="closeEvent()" aria-hidden="true"></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" data-testid="audit-detail">
        <header><h2 id="audit-detail-title">Detalle del evento</h2><button type="button" class="x" aria-label="Cerrar el detalle" data-testid="close-detail" (click)="closeEvent()">×</button></header>
        <p class="what">{{ text(event).title }}</p>
        <dl>
          <dt>Cuándo</dt><dd>{{ event.occurredAt | date: 'medium' }}</dd>
          <dt>Quién</dt><dd>{{ event.actorName ?? 'Sistema' }}</dd>
          @if (event.targetName) { <dt>Sobre</dt><dd>{{ event.targetName }}</dd> }
          <dt>Empresa</dt><dd>{{ event.organizationName ?? '—' }}</dd>
          <dt>Registrado desde</dt><dd>{{ event.channel === 'api' ? 'Consola web' : 'Operador (recuperación)' }}</dd>
          <dt>Código de la acción</dt><dd>{{ event.action }}</dd>
          <dt>Identificador</dt><dd>{{ event.id }}</dd>
        </dl>
        <h3>Información adicional</h3>
        @switch (facade.detail.status()) {
          @case ('error') { <div class="alert alert-danger" role="alert"><div>{{ facade.detail.error()?.message ?? 'No se pudo cargar el detalle.' }}</div><button type="button" class="btn btn-secondary btn-sm" (click)="facade.loadEvent(event.id)">Reintentar</button></div> }
          @case ('ready') {
            @if (metadata().length > 0) {
              <dl data-testid="audit-metadata">@for (m of metadata(); track m.key) { <dt>{{ m.label }}</dt><dd>{{ m.value }}</dd> }</dl>
            } @else { <p class="muted small" data-testid="no-metadata">Este evento no tiene información adicional.</p> }
          }
          @default { <p class="muted small" role="status">Cargando…</p> }
        }
      </aside>
    }
  `,
})
export class PlatformAuditComponent {
  protected readonly facade = inject(PlatformActivityFacade);
  private readonly route = inject(ActivatedRoute);
  private readonly location = inject(Location);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly periods = PERIODS;
  protected readonly categories = CATEGORIES;
  protected readonly channels = CHANNELS;
  protected readonly skeletonRows = [1, 2, 3, 4, 5, 6, 7, 8];
  protected readonly icons = {
    search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
    log: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  } as const;
  protected text = activityText;
  /** Qué significa cada color del punto (ver `tone` en `activityText`): se muestra como leyenda y al pasar el cursor. */
  protected readonly tones = [
    { tone: 'success', label: 'Alta, activación o aceptación' },
    { tone: 'info', label: 'Modificación o invitación' },
    { tone: 'warning', label: 'Desactivación, eliminación o cancelación' },
    { tone: 'danger', label: 'Revocación de un rol o borrado definitivo' },
  ] as const;
  protected toneMeaning(tone: string): string {
    return this.tones.find((t) => t.tone === tone)?.label ?? this.tones[1].label;
  }

  protected readonly search = signal('');
  private readonly appliedSearch = signal('');
  protected readonly category = signal<AuditCategory | ''>('');
  protected readonly channel = signal<AuditChannel | ''>('');
  protected readonly period = signal<Period>('30');
  protected readonly dateFrom = signal('');
  protected readonly dateTo = signal('');
  /** Empresa elegida (`?empresa=<id>`): el servidor filtra con `organization_id`. */
  protected readonly companyId = signal('');
  /** Cursores de las páginas visitadas: la última es la actual; «Anterior» la quita. Solo se conserva la página visible. */
  protected readonly cursors = signal<readonly (string | null)[]>([null]);
  protected readonly pageSize = signal(storedSize());
  /** Total de la primera página (las siguientes no lo traen): se conserva mientras no cambien los filtros. */
  private readonly knownTotal = signal<{ readonly total: number; readonly capped: boolean } | null>(null);
  protected readonly selected = signal<ActivityItem | null>(null);
  private opener: Element | null = null;
  private readonly document = inject(DOCUMENT);
  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  protected readonly items = computed(() => this.facade.list.data()?.items ?? []);
  protected readonly pageIndex = computed(() => this.cursors().length - 1);
  protected readonly from = computed(() => this.pageIndex() * this.pageSize() + 1);
  protected readonly to = computed(() => this.pageIndex() * this.pageSize() + this.items().length);
  /** «53», o «10.000+» cuando el total llegó acotado. */
  protected readonly totalLabel = computed(() => {
    const known = this.knownTotal();

    return known ? `${COUNT.format(known.total)}${known.capped ? '+' : ''}` : '';
  });
  protected readonly metadata = computed(() =>
    Object.entries(this.facade.detail.data()?.details ?? {}).map(([key, value]) => ({ key, label: METADATA_LABELS[key] ?? key, value: displayValue(key, value) })),
  );
  protected readonly rangeInvalid = computed(() => this.period() === 'range' && !!this.dateFrom() && !!this.dateTo() && this.dateFrom() > this.dateTo());
  /** Nombre de la empresa filtrada, tomado de los propios eventos (la URL solo trae el id). */
  protected readonly companyName = computed(() => this.items().find((item) => item.organizationName)?.organizationName ?? 'seleccionada');
  /** Hay algún criterio distinto del período por defecto (30 días). */
  protected readonly hasFilters = computed(() => !!(this.appliedSearch() || this.category() || this.channel() || this.companyId() || this.period() !== '30'));
  protected readonly filter = computed<AuditFilter>(() => {
    const period = this.period();

    return {
      days: period === '7' ? 7 : period === '30' ? 30 : period === '90' ? 90 : undefined,
      dateFrom: period === 'range' ? this.dateFrom() || undefined : undefined,
      dateTo: period === 'range' ? this.dateTo() || undefined : undefined,
      organizationId: this.companyId() || undefined,
      category: this.category() || undefined,
      channel: this.channel() || undefined,
      query: this.appliedSearch() || undefined,
    };
  });

  constructor() {
    this.restore(this.route.snapshot.queryParamMap);

    // Una sola fuente de verdad: cualquier cambio de criterio, página o tamaño pide UNA página al servidor.
    effect(() => {
      const filter = this.filter();
      const request = { pageSize: this.pageSize(), cursor: this.cursors().at(-1) };
      const invalid = this.rangeInvalid();

      untracked(() => {
        if (!invalid) this.facade.loadPage(request, filter);
        this.syncUrl();
      });
    });
    effect(() => {
      const data = this.facade.list.data();

      if (data?.total != null) this.knownTotal.set({ total: data.total, capped: data.totalCapped });
    });
    this.destroyRef.onDestroy(() => this.searchTimer !== null && clearTimeout(this.searchTimer));
  }

  protected reload(): void {
    this.facade.loadPage({ pageSize: this.pageSize(), cursor: this.cursors().at(-1) }, this.filter());
  }
  protected ago(moment: Date): string {
    return relativeTime(moment);
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.search.set(value);

    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => this.applySearch(value), SEARCH_DEBOUNCE_MS);
  }
  protected clearSearch(): void { this.search.set(''); this.applySearch(''); }
  private applySearch(value: string): void {
    if (this.searchTimer !== null) clearTimeout(this.searchTimer);
    this.searchTimer = null;

    if (value.trim() === this.appliedSearch()) return;

    this.appliedSearch.set(value.trim());
    this.firstPage();
  }
  protected setCategory(event: Event): void { this.category.set((event.target as HTMLSelectElement).value as AuditCategory | ''); this.firstPage(); }
  protected setChannel(event: Event): void { this.channel.set((event.target as HTMLSelectElement).value as AuditChannel | ''); this.firstPage(); }
  protected setPeriod(event: Event): void {
    this.period.set((event.target as HTMLSelectElement).value as Period);
    this.firstPage();
  }
  protected setDate(which: 'from' | 'to', event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    (which === 'from' ? this.dateFrom : this.dateTo).set(DATE.test(value) ? value : '');
    this.firstPage();
  }
  protected clearCompany(): void { this.companyId.set(''); this.firstPage(); }
  protected clearFilters(): void {
    this.search.set('');
    this.appliedSearch.set('');
    this.category.set('');
    this.channel.set('');
    this.period.set('30');
    this.dateFrom.set('');
    this.dateTo.set('');
    this.companyId.set('');
    this.firstPage();
  }
  protected next(): void {
    const cursor = this.facade.list.data()?.nextCursor;

    if (cursor) this.cursors.update((stack) => [...stack, cursor]);
  }
  protected previous(): void {
    this.cursors.update((stack) => (stack.length > 1 ? stack.slice(0, -1) : stack));
  }
  /** Cualquier cambio de filtro o de tamaño invalida los cursores (solo valen con los mismos filtros) y el total conocido. */
  private firstPage(): void {
    this.cursors.set([null]);
    this.knownTotal.set(null);
  }

  protected open(item: ActivityItem, event: Event): void {
    event.preventDefault();
    this.opener = this.document.activeElement;
    this.selected.set(item);
    this.facade.loadEvent(item.id);
    setTimeout(() => this.document.querySelector<HTMLElement>('[data-testid="close-detail"]')?.focus());
  }
  protected closeEvent(): void {
    if (this.selected() === null) return;

    this.selected.set(null);
    this.facade.closeEvent();
    (this.opener as HTMLElement | null)?.focus?.();
    this.opener = null;
  }
  protected setPageSize(size: number): void {
    try { localStorage.setItem(SIZE_KEY, String(size)); } catch { /* la preferencia es opcional */ }

    this.pageSize.set(size);
    this.firstPage();
  }

  private restore(params: ParamMap): void {
    const size = Number(params.get('tam'));
    const q = params.get('q') ?? '';
    const category = params.get('tipo') as AuditCategory | null;
    const channel = params.get('origen') as AuditChannel | null;
    const period = PERIODS.find((p) => p.url !== '' && p.url === params.get('periodo'));
    const company = params.get('empresa') ?? '';

    if (CURSOR_PAGE_SIZES.includes(size)) this.pageSize.set(size);
    this.search.set(q);
    this.appliedSearch.set(q.trim());
    if (CATEGORIES.some((c) => c.value === category)) this.category.set(category!);
    if (CHANNELS.some((c) => c.value === channel)) this.channel.set(channel!);
    if (period) this.period.set(period.value);
    if (DATE.test(params.get('desde') ?? '')) this.dateFrom.set(params.get('desde')!);
    if (DATE.test(params.get('hasta') ?? '')) this.dateTo.set(params.get('hasta')!);
    if (/^[0-9a-f-]{36}$/i.test(company)) this.companyId.set(company);
  }

  /** Refleja los criterios en la URL (se puede compartir y «Atrás» los conserva) sin una entrada de historial por cada cambio. */
  private syncUrl(): void {
    const period = PERIODS.find((p) => p.value === this.period())!;
    const entries: [string, string][] = [
      ['q', this.appliedSearch()],
      ['tipo', this.category()],
      ['origen', this.channel()],
      ['periodo', period.url],
      ['desde', this.period() === 'range' ? this.dateFrom() : ''],
      ['hasta', this.period() === 'range' ? this.dateTo() : ''],
      ['empresa', this.companyId()],
      ['tam', this.pageSize() === 25 ? '' : String(this.pageSize())],
    ];
    const query = entries.filter(([, value]) => value).map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');

    this.location.replaceState(this.location.path().split('?')[0], query);
  }
}
