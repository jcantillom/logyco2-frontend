import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { ImportPeriod } from '../../domain/models/imports';
import { periodKind, periodRangeLabel } from '../../domain/models/period';
import { formatCount } from '../imports/imports.labels';
import { PeriodSelection, samePeriod } from './imports-overview.facade';

const CALENDAR = 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4';
const PENDING = 'Se define al subir tu primer archivo';
/** Cuántos periodos se listan (los más recientes); el panel nunca tiene scroll interno. */
export const MAX_VISIBLE_PERIODS = 8;
const ALL_LABEL = 'Todos los periodos';
/** Hasta cuántos caracteres puede tener el rango para mostrar además el tipo en el control. */
const SHORT_RANGE = 22;
/** Ancho mínimo del panel (px), para decidir de qué lado anclarlo. */
const PANEL_MIN = 340;

interface Option {
  readonly id: string;
  readonly selection: PeriodSelection;
  readonly title: string;
  readonly range: string;
  readonly kind: string | null;
  readonly detail: string | null;
}

/**
 * Franja «Periodo» como selector de los periodos cargados (combobox/listbox accesible, sin librerías): «Todos los periodos» y los 8 más
 * recientes con su rango, su tipo y cuántas cargas y viajes traen. Sin periodos es una franja informativa («—»). Presentacional: la
 * selección y la lista viven en `ImportsOverviewFacade`.
 */
@Component({
  selector: 'app-period-selector',
  imports: [NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:click)': 'onDocumentClick($event)', '(window:resize)': 'open.set(false)' },
  styles: [
    `
      /* Selector compacto (≈ 44 px) con el ancho de su contenido (260–360 px); en móvil ocupa todo el ancho. El panel se ancla a su borde derecho. */
      :host { display: block; position: relative; flex: 0 1 auto; width: fit-content; min-width: 260px; max-width: 360px; }
      .pc { all: unset; box-sizing: border-box; display: flex; align-items: center; gap: 10px; width: 100%; min-height: 44px; padding: 4px 12px; border: 1px solid var(--c-bd); border-radius: var(--radius); background: var(--c-sf); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-head) 14%, transparent); transition: border-color 0.15s, box-shadow 0.15s; }
      button.pc, a.pc { cursor: pointer; }
      button.pc:hover, a.pc:hover, button.pc[aria-expanded='true'] { border-color: color-mix(in srgb, var(--c-primary) 40%, var(--c-sf)); }
      .pc:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .ico { display: grid; place-items: center; flex: none; width: 28px; height: 28px; border-radius: 9px; background: var(--c-ok-soft); color: var(--c-primary); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-primary) 20%, transparent); }
      .ico svg { width: 16px; height: 16px; fill: color-mix(in srgb, currentColor 14%, transparent); stroke: currentColor; stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
      .tx { flex: 1; display: grid; min-width: 0; line-height: 1.2; }
      .label { display: flex; gap: 4px; min-width: 0; font-size: 0.68rem; font-weight: 600; color: var(--c-text2); white-space: nowrap; overflow: hidden; }
      .label .kind { overflow: hidden; text-overflow: ellipsis; }
      .range { min-width: 0; font-size: 0.92rem; font-weight: 750; color: var(--c-head); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
      .range.none { display: flex; align-items: baseline; gap: 8px; }
      .range.none b { color: var(--c-mute2); }
      .range.none span { min-width: 0; overflow: hidden; text-overflow: ellipsis; font-size: 0.78rem; font-weight: 500; color: var(--c-text2); }
      .chev { flex: none; width: 18px; height: 18px; fill: none; stroke: var(--c-mu); stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.15s; }
      [aria-expanded='true'] .chev { transform: rotate(180deg); }
      .panel { position: absolute; z-index: 20; top: calc(100% + 6px); right: 0; box-sizing: border-box; min-width: 340px; width: max-content; max-width: min(440px, calc(100vw - 16px)); margin: 0; padding: 6px; list-style: none; border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); box-shadow: 0 14px 32px color-mix(in srgb, var(--c-head) 20%, transparent); }
      .panel.left { right: auto; left: 0; }
      .opt { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; align-items: center; gap: 2px 10px; padding: 9px 12px; border-radius: 12px; cursor: pointer; }
      .opt.active { background: var(--c-s2); outline: 2px solid var(--c-focus); outline-offset: -2px; }
      .opt[aria-selected='true'] { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); }
      .opt .t { min-width: 0; display: grid; }
      .opt .t strong { color: var(--c-head); font-size: 0.95rem; overflow-wrap: anywhere; }
      .opt .t small { color: var(--c-mu); font-size: 0.8rem; font-variant-numeric: tabular-nums; }
      .opt .k { padding: 2px 10px; border-radius: 999px; background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); color: color-mix(in srgb, var(--c-primary) 80%, var(--c-head)); font-size: 0.74rem; font-weight: 700; white-space: nowrap; }
      .opt .ok { width: 18px; height: 18px; fill: none; stroke: var(--c-primary); stroke-width: 2.6; stroke-linecap: round; stroke-linejoin: round; }
      .opt .ok.off { visibility: hidden; }
      .more { margin: 4px 12px 6px; font-size: 0.78rem; color: var(--c-mu); }
      .err { flex: 1; margin: 0; font-size: 0.82rem; color: var(--c-danger); }
      .err button { margin-left: 6px; padding: 0 8px; border: 1px solid var(--c-bd); border-radius: 6px; background: var(--c-sf); color: var(--c-head); font: inherit; font-size: 0.78rem; cursor: pointer; }
      @media (max-width: 700px) { :host { width: 100%; max-width: none; } .panel, .panel.left { left: 0; right: 0; min-width: 0; width: auto; max-width: none; } }
      @media (prefers-reduced-motion: reduce) { .pc, .chev { transition: none; } }
    `,
  ],
  template: `
    @if (status() === 'error') {
      <div class="pc" role="group" aria-label="Periodo" data-testid="period-card">
        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="calendar" /></svg></span>
        <p class="err" role="alert">No se pudo cargar. <button type="button" (click)="retry.emit()">Reintentar</button></p>
      </div>
    } @else if (status() !== 'ready') {
      <div class="pc" role="group" aria-label="Periodo" data-testid="period-card">
        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="calendar" /></svg></span>
        <span class="skeleton" style="height: 24px; flex: 1" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span>
      </div>
    } @else if (options().length === 0) {
      <ng-template #empty>
        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="calendar" /></svg></span>
        <span class="tx">
          <span class="label">Periodo</span>
          <span class="range none" [attr.title]="pending"><b data-testid="period-range">—</b><span data-testid="period-pending">{{ pending }}</span></span>
        </span>
      </ng-template>
      @if (link(); as target) {
        <a class="pc" [routerLink]="target" aria-label="Periodo: sin definir. Se define al subir tu primer archivo" data-testid="period-card"><ng-container *ngTemplateOutlet="empty" /></a>
      } @else {
        <div class="pc" role="group" aria-label="Periodo: sin definir. Se define al subir tu primer archivo" data-testid="period-card"><ng-container *ngTemplateOutlet="empty" /></div>
      }
    } @else {
      <button type="button" class="pc" role="combobox" data-testid="period-card" aria-haspopup="listbox" aria-controls="period-listbox"
              [attr.aria-expanded]="open()" [attr.aria-activedescendant]="open() ? options()[active()].id : null" [attr.aria-label]="'Periodo: ' + current().title + ', ' + current().range"
              [attr.title]="summary()" (click)="toggle()" (keydown)="onKey($event)">
        <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="calendar" /></svg></span>
        <span class="tx">
          <span class="label">Periodo @if (showKind(); as k) { <span class="kind" data-testid="period-kind">· {{ k }}</span> }</span>
          <span class="range" data-testid="period-range">{{ summary() }}</span>
        </span>
        <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      @if (open()) {
        <ul class="panel" [class.left]="alignLeft()" id="period-listbox" role="listbox" aria-label="Periodos cargados" data-testid="period-panel">
          @for (option of options(); track option.id; let i = $index) {
            <!-- Las opciones se operan con teclado desde el botón (aria-activedescendant); el clic es el atajo del ratón. -->
            <!-- eslint-disable-next-line @angular-eslint/template/click-events-have-key-events, @angular-eslint/template/interactive-supports-focus -->
            <li class="opt" role="option" [id]="option.id" [class.active]="i === active()" [attr.aria-selected]="i === selectedIndex()" [attr.data-testid]="'period-option-' + i" (click)="choose(i)" (mouseenter)="active.set(i)">
              <span class="t"><strong>{{ option.title }}</strong>@if (option.detail) { <small>{{ option.detail }}</small> }</span>
              @if (option.kind) { <span class="k">{{ option.kind }}</span> }
              <svg class="ok" [class.off]="i !== selectedIndex()" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            </li>
          }
          @if (periods().length > max) { <li class="more" role="presentation" data-testid="period-more">Mostrando los {{ max }} periodos más recientes</li> }
        </ul>
      }
    }
  `,
})
export class PeriodSelectorComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Periodos cargados, los más recientes primero. */
  readonly periods = input<readonly ImportPeriod[]>([]);
  readonly selection = input<PeriodSelection>('ALL');
  readonly status = input<ResourceStatus>('ready');
  /** Enlace de la franja informativa (sin periodos) a `/cargas`. */
  readonly link = input<string | null>(null);
  readonly selected = output<PeriodSelection>();
  readonly retry = output();

  protected readonly calendar = CALENDAR;
  protected readonly pending = PENDING;
  protected readonly max = MAX_VISIBLE_PERIODS;
  protected readonly open = signal(false);
  protected readonly active = signal(0);
  /** El panel se ancla al borde izquierdo si, anclado a la derecha, se saldría de la pantalla. */
  protected readonly alignLeft = signal(false);

  /** «Todos los periodos» (de la fecha menor a la mayor de la lista) y los periodos más recientes. */
  protected readonly options = computed<readonly Option[]>(() => {
    const list = this.periods();

    if (list.length === 0) return [];

    const from = list.reduce((min, p) => (p.from < min ? p.from : min), list[0].from);
    const to = list.reduce((max, p) => (p.to > max ? p.to : max), list[0].to);
    const rows = list.reduce((sum, p) => sum + p.rowsRead, 0);
    const imports = list.reduce((sum, p) => sum + p.imports, 0);
    const all: Option = { id: 'period-option-all', selection: 'ALL', title: ALL_LABEL, range: periodRangeLabel(from, to) ?? '', kind: periodKind(from, to), detail: this.detail(imports, rows) };

    return [
      all,
      ...list.slice(0, MAX_VISIBLE_PERIODS).map((p, i): Option => {
        const range = periodRangeLabel(p.from, p.to) ?? `${p.from} a ${p.to}`;

        return { id: `period-option-${i}`, selection: { from: p.from, to: p.to }, title: range, range, kind: periodKind(p.from, p.to), detail: this.detail(p.imports, p.rowsRead) };
      }),
    ];
  });
  protected readonly selectedIndex = computed(() => {
    const selection = this.selection();

    return selection === 'ALL' ? 0 : this.options().findIndex((o) => o.selection !== 'ALL' && samePeriod(o.selection, selection));
  });
  /** La opción mostrada en el botón: la elegida o, si ya no está entre las visibles, el rango elegido tal cual. */
  protected readonly current = computed<Option>(() => {
    const index = this.selectedIndex();

    if (index >= 0) return this.options()[index];

    const selection = this.selection();
    const range = selection === 'ALL' ? '' : (periodRangeLabel(selection.from, selection.to) ?? '');

    return { id: 'period-option-current', selection, title: range, range, kind: selection === 'ALL' ? null : periodKind(selection.from, selection.to), detail: null };
  });

  /** Texto del control: «Abr 2026 a Jun 2026» o «Todos los periodos (Ene 2026 a Jun 2026)» (también va en el `title`). */
  protected readonly summary = computed(() => {
    const c = this.current();

    return c.selection === 'ALL' && c.range ? `${c.title} (${c.range})` : c.title;
  });
  /** El tipo (Trimestral…) se ve bajo la etiqueta solo si cabe en una línea sin crecer el control; si no, queda en el panel. */
  protected readonly showKind = computed(() => (this.summary().length <= SHORT_RANGE ? this.current().kind : null));

  protected toggle(): void {
    if (this.open()) this.open.set(false);
    else this.openPanel();
  }

  protected onKey(event: KeyboardEvent): void {
    const last = this.options().length - 1;

    if (!this.open()) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        this.openPanel();
      }

      return;
    }

    const move = (to: number): void => {
      event.preventDefault();
      this.active.set(Math.max(0, Math.min(last, to)));
    };

    switch (event.key) {
      case 'ArrowDown': return move(this.active() + 1);
      case 'ArrowUp': return move(this.active() - 1);
      case 'Home': return move(0);
      case 'End': return move(last);
      case 'Enter':
      case ' ':
        event.preventDefault();
        return this.choose(this.active());
      case 'Escape':
        event.preventDefault();
        return this.open.set(false);
      case 'Tab':
        return this.open.set(false);
    }
  }

  protected choose(index: number): void {
    this.open.set(false);
    this.selected.emit(this.options()[index].selection);
  }

  protected onDocumentClick(event: MouseEvent): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  private openPanel(): void {
    this.alignLeft.set(this.host.nativeElement.getBoundingClientRect().right - PANEL_MIN < 8);
    this.active.set(Math.max(0, this.selectedIndex()));
    this.open.set(true);
  }

  private detail(imports: number, rows: number): string {
    return `${formatCount(imports)} ${imports === 1 ? 'carga' : 'cargas'} · ${formatCount(rows)} ${rows === 1 ? 'viaje' : 'viajes'}`;
  }
}
