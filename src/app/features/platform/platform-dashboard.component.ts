import { DatePipe, DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SessionStore } from '../../core/auth/session.store';
import { TrendRange } from '../../domain/models/platform-admin';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { CHART_COLORS, DonutSegment } from '../../shared/ui/charts/chart-model';
import { DonutChartComponent } from '../../shared/ui/charts/donut-chart.component';
import { FuelPriceCardsComponent } from '../intelligence/fuel-price-cards.component';
import { IntelligenceFacade } from '../intelligence/intelligence.facade';
import { activityLine, relativeTime } from './platform-labels';
import { PlatformEvolutionCardComponent } from './platform-evolution-card.component';
import { PlatformDashboardFacade } from './platform.facades';

type Preset = 7 | 30 | 90;

const PRESETS: readonly Preset[] = [7, 30, 90];
const TYPE_COLORS = [CHART_COLORS.green, 'var(--c-chart-8)', CHART_COLORS.blue, CHART_COLORS.amber, CHART_COLORS.petrol];

/** Iconos de trazo (24×24), sin dependencias externas. */
const ICONS = {
  building: 'M4 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16M14 9h5a1 1 0 0 1 1 1v11M8 8h2M8 12h2M8 16h2M4 21h16',
  check: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6',
  cross: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM9 9l6 6M15 9l-6 6',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  users: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 5a3.5 3.5 0 0 1 0 6M19 20a7 7 0 0 0-3-5.7',
  crown: 'M3 8l4 4 5-7 5 7 4-4-2 11H5z',
  chart: 'M4 20V4M4 20h16M8 15l3-4 3 2 5-6',
  leaf: 'M5 19c0-8 6-14 15-14 0 9-6 15-14 15M5 19c2-5 6-8 10-10',
  bolt: 'M13 2L4 14h7l-1 8 9-12h-7z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  shield: 'M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z',
  server: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01',
  database: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  lock: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  gear: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.4-2.3 1a7 7 0 0 0-2-1.2L14 3h-4l-.6 2.7a7 7 0 0 0-2 1.2l-2.3-1-2 3.4 2 1.5A7 7 0 0 0 5 12c0 .4 0 .8.1 1.2l-2 1.5 2 3.4 2.3-1c.6.5 1.3.9 2 1.2L10 21h4l.6-2.7c.7-.3 1.4-.7 2-1.2l2.3 1 2-3.4-2-1.5c.1-.4.1-.8.1-1.2z',
  person: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  mail: 'M3 6h18v12H3zM3 7l9 7 9-7',
  calendar: 'M4 6h16v14H4zM4 10h16M8 3v4M16 3v4',
  chevron: 'M9 6l6 6-6 6',
  arrow: 'M5 12h14M13 6l6 6-6 6',
} as const;

const ACTIVITY_ICON = { organization: 'building', person: 'person', invitation: 'mail', role: 'crown', membership: 'users' } as const;

@Component({
  selector: 'app-platform-dashboard',
  imports: [FuelPriceCardsComponent, DatePipe, DecimalPipe, RouterLink, ResourceStateComponent, DonutChartComponent, PlatformEvolutionCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      svg.i { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .period { position: relative; display: inline-flex; align-items: center; }
      .period svg.i { position: absolute; left: 12px; width: 18px; height: 18px; color: var(--c-head); pointer-events: none; }
      .period select { appearance: none; min-height: 42px; padding: 0 36px 0 38px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); font: inherit; font-weight: 600; color: var(--c-head); cursor: pointer; }
      .period::after { content: ''; position: absolute; right: 14px; width: 7px; height: 7px; border-right: 2px solid var(--c-gray); border-bottom: 2px solid var(--c-gray); transform: rotate(45deg) translateY(-2px); pointer-events: none; }
      .range { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }

      .kpis { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(138px, 1fr)); }
      .kpi { display: flex; align-items: center; gap: 10px; padding: 12px 12px; background: var(--c-sf); border: 1px solid var(--c-bd); border-radius: 14px; box-shadow: var(--shadow); text-decoration: none; color: inherit; min-width: 0; transition: border-color 0.15s, transform 0.15s; }
      .kpi .ico { flex: none; display: grid; place-items: center; width: 40px; height: 40px; border-radius: 11px; background: var(--c-ok-soft); color: var(--c-accent); }
      .kpi .ico.red { background: var(--c-bad-soft); color: var(--c-danger); } .kpi .ico.amber { background: var(--c-warn-soft); color: #b87a00; }
      .kpi .body { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .kpi .label { font-size: 0.78rem; color: var(--c-head); font-weight: 600; line-height: 1.2; }
      .kpi .line { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
      .kpi .value { font-size: 1.7rem; font-weight: 800; line-height: 1.15; color: var(--c-head); font-variant-numeric: tabular-nums; }
      .kpi .value small { font-size: 0.95rem; color: var(--c-mu); font-weight: 700; }
      .delta { display: inline-flex; align-items: center; gap: 3px; padding: 2px 8px; border-radius: 999px; background: var(--c-ok-soft); color: var(--c-success); font-size: 0.74rem; font-weight: 800; }
      .delta.red { background: var(--c-bad-soft); color: var(--c-danger); }
      .bar { height: 7px; border-radius: 4px; background: var(--c-s3); overflow: hidden; display: flex; margin-top: 4px; }
      .bar i { display: block; height: 100%; background: linear-gradient(90deg, var(--c-primary), var(--c-secondary)); }
      .bar i.reserved { background: repeating-linear-gradient(45deg, var(--c-secondary-soft) 0 4px, var(--c-secondary-200) 4px 8px); }

      .head { display: flex; align-items: flex-start; gap: 10px; flex-wrap: wrap; }
      .head .ico { color: var(--c-accent); margin-top: 2px; }
      .head h2 { margin: 0; } .head p { color: var(--c-mu); font-size: 0.86rem; }
      .head .grow { flex: 1; min-width: 160px; }
      .seg { display: inline-flex; border: 1px solid var(--c-bd); border-radius: 9px; overflow: hidden; background: var(--c-s2); }
      .seg button { border: 0; background: none; padding: 6px 14px; font: inherit; font-size: 0.84rem; font-weight: 600; color: var(--c-mu); cursor: pointer; }
      .seg button[aria-pressed='true'] { background: var(--c-primary); color: #fff; }
      .grid-main { display: grid; gap: 14px; grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr); }
      .grid-half { display: grid; gap: 14px; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
      @media (max-width: 1100px) { .grid-main, .grid-half { grid-template-columns: minmax(0, 1fr); } }
      .period-line { font-size: 0.82rem; color: var(--c-mu); }
      .chips { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.84rem; color: var(--c-mu); }
      .chips b { color: var(--c-accent); font-variant-numeric: tabular-nums; }
      .empty { text-align: center; padding: 26px 10px; color: var(--c-mu); }
      .empty strong { display: block; color: var(--c-accent); }

      .todo { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .todo a { display: flex; align-items: center; gap: 12px; padding: 7px 12px; border: 1px solid var(--c-bd); border-radius: 12px; text-decoration: none; color: inherit; background: var(--c-sf); }
      .todo a:hover { border-color: var(--c-gray-400); background: var(--c-s2); }
      .todo .ico { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 9px; background: var(--c-ok-soft); color: var(--c-accent); flex: none; }
      .todo .txt { flex: 1; min-width: 0; display: flex; flex-direction: column; }
      .todo .txt strong { font-size: 0.93rem; color: var(--c-head); }
      .todo .txt span { font-size: 0.8rem; color: var(--c-mu); }
      .todo .count { min-width: 30px; text-align: center; padding: 2px 9px; border-radius: 999px; font-weight: 800; font-size: 0.84rem; background: var(--c-s3); color: var(--c-mu); }
      .todo.info a { background: var(--c-s2); }
      .follow-title { margin: 14px 0 6px; color: var(--c-mu); font-size: 0.8rem; font-weight: 700; }
      .clear { display: flex; align-items: center; gap: 12px; margin: 0; padding: 14px; border: 1px dashed var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .clear .ico { display: grid; place-items: center; width: 32px; height: 32px; flex: none; border-radius: 9px; background: var(--c-ok-soft); color: var(--c-accent); }
      .clear .txt { display: flex; flex-direction: column; }
      .clear .txt strong { color: var(--c-head); font-size: 0.93rem; }
      .clear .txt span { color: var(--c-mu); font-size: 0.8rem; }
      .todo svg.go { width: 16px; height: 16px; color: var(--c-mu); }
      .badge-num { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; border-radius: 11px; background: var(--c-danger); color: #fff; font-size: 0.75rem; font-weight: 800; }

      .feed { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
      .feed li { display: grid; grid-template-columns: 34px minmax(0, 1fr) minmax(0, 150px) auto; align-items: center; gap: 12px; padding: 6px 12px; border: 1px solid var(--c-bd); border-radius: 12px; font-size: 0.88rem; }
      .feed .ico { display: grid; place-items: center; width: 28px; height: 28px; border-radius: 8px; background: var(--c-ok-soft); color: var(--c-accent); }
      .feed .ico svg.i { width: 17px; height: 17px; }
      .feed .actor { color: var(--c-mu); font-size: 0.82rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .feed time { color: var(--c-mu); font-size: 0.82rem; white-space: nowrap; min-width: 82px; text-align: right; }
      @media (max-width: 700px) { .feed li { grid-template-columns: 34px minmax(0, 1fr); } .feed .actor, .feed time { grid-column: 2; text-align: left; } }

      :host { display: block; }
      .st { display: inline-flex; align-items: center; gap: 6px; font-size: 0.78rem; font-weight: 700; padding: 1px 9px; border-radius: 999px; width: fit-content; background: var(--c-s3); color: var(--c-info); }
      .st::before { content: ''; width: 8px; height: 8px; border-radius: 50%; background: var(--c-gray-400); }
      .st.up { background: var(--c-s3); color: var(--c-success); } .st.up::before { background: var(--c-primary); }
      .st.down { background: var(--c-bad-soft); color: var(--c-danger); } .st.down::before { background: var(--c-danger); }
      /* Dashboard-local presentation: preserve shared shell and chart contracts. */
      .executive-dashboard { gap: 12px; }
      .page-header { position: relative; isolation: isolate; overflow: hidden; padding: 4px 0 8px; border-radius: 0; background: transparent; color: var(--c-head); align-items: center; gap: 24px; }
      .heading-copy { flex: 1 1 340px; max-width: 660px; }
      .eyebrow { display: flex; align-items: center; gap: 8px; font-size: .68rem; font-weight: 700; letter-spacing: .14em; text-transform: uppercase; color: var(--c-accent); }
      .eyebrow svg.i { width: 16px; height: 16px; color: var(--c-accent); }
      .page-header h1 { margin: 6px 0 4px; font-size: clamp(1.4rem, 2vw, 1.8rem); letter-spacing: -.045em; font-weight: 700; color: var(--c-head); line-height: 1.15; }
      .page-header p { color: var(--c-mu); font-size: .88rem; line-height: 1.4; max-width: 600px; }
      .header-actions { display: flex; flex-direction: column; align-items: stretch; gap: 10px; min-width: 204px; }
      .manage-link { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 11px 14px; border-radius: 10px; background: var(--c-primary); color: #fff; font-weight: 700; font-size: .83rem; text-decoration: none; transition: background .18s; }
      .manage-link:hover { background: var(--c-primary-700); }
      .manage-link svg.i { width: 18px; height: 18px; }
      .period { display: flex; }
      .period select { width: 100%; min-height: 40px; background: var(--c-sf); color: var(--c-head); border-color: var(--c-bd); font-size: .8rem; }
      .period select option { background: var(--c-sf); color: var(--c-head); }
      .period svg.i { color: var(--c-head); }
      .period::after { border-color: var(--c-gray); }
      .section-kicker { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 8px; margin: 0 0 4px; font-size: .75rem; color: var(--c-mu); }
      .section-kicker strong { color: var(--c-head); font-weight: 650; }
      .kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); gap: 12px; }
      .kpi { position: relative; flex-direction: row; align-items: center; gap: 9px; padding: 12px; border-color: var(--c-bd); border-radius: 16px; box-shadow: 0 3px 14px color-mix(in srgb, var(--c-gray) 2%, transparent); }
      .kpi:hover { transform: translateY(-3px); border-color: var(--c-primary-400); box-shadow: 0 8px 22px color-mix(in srgb, var(--c-gray) 4%, transparent); }
      .kpi .ico { width: 34px; height: 34px; border-radius: 10px; }
      .kpi .ico svg.i { width: 19px; height: 19px; }
      .kpi .body { width: 100%; gap: 4px; }
      .kpi .label { min-height: 2.4em; color: var(--c-mu); font-size: .72rem; line-height: 1.2; }
      .kpi .value { font-size: clamp(1.45rem, 1.8vw, 1.8rem); font-weight: 650; letter-spacing: -.045em; }
      .kpi .line { justify-content: space-between; gap: 5px; }
      .delta { font-size: .65rem; padding: 3px 6px; }
      .kpi:first-child { border-top: 3px solid var(--c-primary); padding-top: 10px; }
      section.card { border-color: var(--c-bd); border-radius: 18px; box-shadow: 0 3px 16px color-mix(in srgb, var(--c-gray) 1%, transparent); padding: 16px; gap: 10px; min-width: 0; }
      .grid-main { gap: 14px; grid-template-columns: minmax(0, 1.65fr) minmax(0, 1fr); }
      .grid-half { gap: 14px; }
      .head { align-items: center; gap: 10px; }
      .head > .ico { width: 19px; height: 19px; margin: 0; }
      .head h2 { font-size: .98rem; font-weight: 650; letter-spacing: -.02em; }
      .head p { margin-top: 5px; font-size: .75rem; line-height: 1.5; }
      .head .small { font-size: .75rem; font-weight: 600; text-underline-offset: 4px; }
      .seg { padding: 3px; border-color: var(--c-bd); border-radius: 10px; }
      .seg button { border-radius: 7px; font-size: .72rem; padding: 7px 10px; }
      .period-line { font-size: .72rem; line-height: 1.6; margin-bottom: 12px; }
      app-trend-chart { display: block; min-height: 120px; }
      app-donut-chart { justify-content: center; margin: auto 0; gap: 24px; }
      .distribution-note { font-size: .72rem; line-height: 1.6; color: var(--c-mu); border-top: 1px solid var(--c-bd); padding-top: 8px; }
      .chips { gap: 10px 16px; padding-top: 8px; margin-top: 6px; border-top: 1px solid var(--c-bd); font-size: .72rem; }
      .todo { gap: 9px; }
      .todo a { padding: 9px 12px; border-color: var(--c-bd); border-radius: 12px; transition: background .18s, border-color .18s; }
      .todo .txt strong { font-size: .82rem; }
      .todo .txt span { font-size: .73rem; line-height: 1.5; margin-top: 3px; }
      .todo .count.on, .badge-num { background: var(--c-warn-soft); color: var(--c-warning); }
      .badge-num { vertical-align: middle; margin-left: 5px; }
      .feed { gap: 0; }
      .feed li { grid-template-columns: 30px minmax(0, 1fr) auto; border: 0; border-bottom: 1px solid var(--c-bd); border-radius: 0; gap: 4px 10px; padding: 8px 0; font-size: .78rem; }
      .feed li:last-child { border-bottom: 0; }
      .feed .ico { grid-row: span 2; }
      .feed li > span:nth-child(2) { white-space: normal; overflow-wrap: anywhere; }
      .feed .actor { grid-column: 2; font-size: .7rem; }
      .feed time { grid-column: 3; grid-row: 1 / span 2; font-size: .68rem; min-width: 0; }
      .st { font-size: .67rem; }
      .grid-main[hidden], .grid-half[hidden] { display: none; }
      @media (min-width: 1101px) { .grid-main, .grid-half { min-height: 260px; } }
      @media (max-width: 1200px) { .kpis { grid-template-columns: repeat(3, minmax(0, 1fr)); } .kpi { flex-direction: row; gap: 12px; } }
      @media (max-width: 600px) {
        .executive-dashboard { gap: 18px; }
        .page-header { padding: 4px 0; }
        .header-actions { width: 100%; }
        .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
        .kpi { flex-direction: column; padding: 14px; gap: 12px; }
        .kpi:first-child { padding-top: 12px; }
        section.card { padding: 18px; }
        .seg { width: 100%; } .seg button { flex: 1; }
          .feed time { grid-column: 2; grid-row: auto; text-align: left; }
        .todo .txt strong { overflow-wrap: anywhere; }
      }
      @media (prefers-reduced-motion: no-preference) { .executive-dashboard { animation: reveal .35s ease-out both; } @keyframes reveal { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: none; } } }
      @media (prefers-reduced-motion: reduce) { .kpi, .todo a, .manage-link { transition: none; } .kpi:hover { transform: none; } }
    `,
  ],
  template: `
    <div class="page executive-dashboard">
      <header class="page-header">
        <div class="heading-copy">
          <h1>Bienvenido, {{ userName() }}</h1>
          <p>Monitorea la adopción, la gestión de empresas y la operación general de la plataforma.</p>
        </div>
        <div class="header-actions">
        <div class="period">
          <svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.calendar" /></svg>
          <label class="sr-only" for="period">Período</label>
          <select id="period" data-testid="period" (change)="onPeriod($event)">
            @for (days of presets; track days) { <option [value]="days" [selected]="periodValue() === '' + days">Últimos {{ days }} días</option> }
            <option value="custom" [selected]="periodValue() === 'custom'">Personalizado</option>
          </select>
        </div>
        </div>
      </header>

      @if (customOpen()) {
        <form class="range card" (submit)="$event.preventDefault(); applyCustom()">
          <div class="field"><label for="range-from">Desde</label><input id="range-from" class="input" type="date" [max]="today" [value]="from()" (input)="from.set($any($event.target).value)" /></div>
          <div class="field"><label for="range-to">Hasta</label><input id="range-to" class="input" type="date" [max]="today" [value]="to()" (input)="to.set($any($event.target).value)" /></div>
          <button type="submit" class="btn btn-primary" [disabled]="!rangeValid()">Aplicar</button>
          @if (!rangeValid()) { <span class="field-error" role="alert">{{ rangeProblem() }}</span> }
        </form>
      }

      <!-- KPI del estado actual -->
      <app-resource-state skeleton="kpis" [status]="dash.admin.status()" [error]="dash.admin.error()" (retry)="dash.load()">
        @if (dash.admin.data(); as m) {
          <div class="kpis" data-testid="admin-cards">
            <a class="kpi tone-green" routerLink="/plataforma/organizaciones" data-testid="kpi-organizations">
              <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.building" /></svg></span>
              <span class="body"><span class="label">Empresas</span><span class="line"><strong class="value">{{ m.organizations.total | number }}</strong>@if (growth(m.organizations.total, 'organizationsCreated'); as g) { <span class="delta" [title]="'Nuevas en el período: ' + created('organizationsCreated')">↑ {{ g }}</span> }</span><span class="hint">Total registradas</span></span>
            </a>
            <a class="kpi tone-emerald" routerLink="/plataforma/organizaciones" [queryParams]="{ filtro: 'activas' }" data-testid="kpi-active">
              <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.check" /></svg></span>
              <span class="body"><span class="label">Activas</span><span class="line"><strong class="value">{{ m.organizations.active | number }}</strong><span class="delta">{{ share(m.organizations.active, m.organizations.total) }}</span></span><span class="meter" aria-hidden="true"><i [style.width.%]="m.organizations.total ? (m.organizations.active / m.organizations.total) * 100 : 0"></i></span></span>
            </a>
            <a class="kpi neutral" routerLink="/plataforma/organizaciones" [queryParams]="{ filtro: 'inactivas' }" data-testid="kpi-inactive">
              <span class="ico red"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.cross" /></svg></span>
              <span class="body"><span class="label">Inactivas</span><span class="line"><strong class="value">{{ m.organizations.inactive | number }}</strong><span class="delta red">{{ share(m.organizations.inactive, m.organizations.total) }}</span></span><span class="meter" aria-hidden="true"><i [style.width.%]="m.organizations.total ? (m.organizations.inactive / m.organizations.total) * 100 : 0"></i></span></span>
            </a>
            <a class="kpi tone-red" [class.attention]="m.organizations.withoutActiveAdmin > 0" routerLink="/plataforma/organizaciones" [queryParams]="{ filtro: 'sin-admin' }" data-testid="kpi-without-admin">
              <span class="ico red"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.alert" /></svg></span>
              <span class="body"><span class="label">Sin administrador activo</span><span class="line"><strong class="value">{{ m.organizations.withoutActiveAdmin | number }}</strong>@if (m.organizations.withoutActiveAdmin > 0) { <span class="delta red" title="Requiere atención">Atender</span> }</span><span class="hint">Esperan o requieren invitación</span></span>
            </a>
            <a class="kpi tone-blue" routerLink="/plataforma/usuarios" data-testid="kpi-users">
              <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.users" /></svg></span>
              <span class="body"><span class="label">Usuarios</span><span class="line"><strong class="value">{{ m.users.total | number }}</strong>@if (growth(m.users.total, 'usersRegistered'); as g) { <span class="delta" [title]="'Nuevos en el período: ' + created('usersRegistered')">↑ {{ g }}</span> }</span><span class="hint">Total registrados</span></span>
            </a>
            <a class="kpi tone-amber" routerLink="/plataforma/superadministradores" data-testid="kpi-super-admins">
              <span class="ico amber"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.crown" /></svg></span>
              <span class="body">
                <span class="label">Superadministradores</span>
                <span class="line"><strong class="value">{{ m.superAdmins.active }} <small>/ {{ m.superAdmins.maxActive }}</small></strong></span>
                <span class="bar" aria-hidden="true"><i [style.width.%]="(m.superAdmins.active / m.superAdmins.maxActive) * 100"></i><i class="reserved" [style.width.%]="(m.superAdmins.reservedByInvitations / m.superAdmins.maxActive) * 100"></i></span>
              </span>
            </a>
          </div>
        }
      </app-resource-state>

      <div class="grid-main" id="dashboard-analysis">
        <app-platform-evolution-card />

        <!-- Por tipo -->
        <section class="card stack" aria-labelledby="type-title" data-testid="distribution">
          <div class="head"><svg class="i ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.leaf" /></svg><div class="grow"><h2 id="type-title">Empresas por tipo</h2></div>@if (typeSegments().length > 0) { <span class="type-count">{{ typeSegments().length }} {{ typeSegments().length === 1 ? 'tipo' : 'tipos' }}</span> }<span class="type-info" tabindex="0" role="note" aria-label="Una empresa con varios tipos se cuenta en cada uno." title="Una empresa puede participar como transportador y generador de carga. Cada tipo se contabiliza por separado.">i</span></div>
          @if (dash.admin.data()) {
            @if (typeSegments().length === 0) {
              <p class="empty">Aún no hay empresas con tipo asignado.</p>
            } @else {
              <app-donut-chart [segments]="typeSegments()" [centerTotal]="companiesWithType()" [fluid]="true" centerLabel="Empresas" ariaLabel="Distribución de empresas por tipo" title="Una empresa con varios tipos se cuenta en cada uno." />
              @if (topType(); as t) { <p class="type-lead">Mayor participación: <strong>{{ t.label }}</strong> · {{ t.share }}%</p> }
}
          } @else {
            <span class="skeleton type-skeleton" aria-hidden="true"></span>
          }
        </section>
      </div>

      <div class="grid-half" id="dashboard-management">
        <!-- Acciones pendientes -->
        <section class="card stack" id="acciones" aria-labelledby="att-title" data-testid="attention">
          <div class="head"><svg class="i ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.bolt" /></svg><div class="grow"><h2 id="att-title">Acciones pendientes @if (dash.pendingActions() > 0) { <span class="badge-num">{{ dash.pendingActions() }}</span> }</h2></div></div>
          @if (dash.admin.data()) {
            @if (dash.actionsRequired().length === 0) {
              <p class="clear" data-testid="attention-clear"><span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.check" /></svg></span><span class="txt"><strong>Todo al día</strong><span>No hay acciones pendientes.</span></span></p>
            } @else {
              <ul class="todo" data-testid="attention-actions">
                @for (item of dash.actionsRequired(); track item.key) {
                  <li>
                    <a [routerLink]="item.path" [queryParams]="item.query ?? null" [attr.data-testid]="'action-' + item.key">
                      <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="actionIcon(item.key)" /></svg></span>
                      <span class="txt"><strong>{{ item.label }}</strong><span>{{ item.hint }}@if (item.detail) { <b> {{ item.detail }}</b> }</span></span>
                      <span class="count on">{{ item.badge ?? item.count }}</span>
                      <svg class="i go" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.chevron" /></svg>
                    </a>
                  </li>
                }
              </ul>
            }
            @if (dash.actionsFollowUp().length > 0) {
              <h3 class="follow-title">En seguimiento</h3>
              <ul class="todo info" data-testid="attention-followup">
                @for (item of dash.actionsFollowUp(); track item.key) {
                  <li>
                    <a [routerLink]="item.path" [queryParams]="item.query ?? null" [attr.data-testid]="'action-' + item.key">
                      <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="actionIcon(item.key)" /></svg></span>
                      <span class="txt"><strong>{{ item.label }}</strong><span>{{ item.hint }}</span></span>
                      <span class="count">{{ item.count }}</span>
                      <svg class="i go" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.chevron" /></svg>
                    </a>
                  </li>
                }
              </ul>
            }
          }
        </section>

        <!-- Actividad reciente -->
        <section class="card stack" aria-labelledby="act-title" data-testid="recent-activity">
          <div class="head"><svg class="i ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.clock" /></svg><div class="grow"><h2 id="act-title">Actividad reciente</h2></div><a routerLink="/plataforma/auditoria" class="small">Ver toda la actividad →</a></div>
          <app-resource-state [grow]="true" [status]="dash.activity.status()" [error]="dash.activity.error()" [empty]="dash.activity.data()?.length === 0" emptyTitle="Aún no hay actividad registrada" emptyMessage="Las acciones administrativas aparecerán aquí a medida que ocurran." (retry)="dash.load()">
            <ul class="feed">
              @for (item of recentActivity(); track item.id) {
                <li>
                  <span class="ico"><svg class="i" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="activityIcon(item)" /></svg></span>
                  <span>{{ line(item).text }}</span>
                  <span class="actor">{{ line(item).actor }}</span>
                  <time [attr.datetime]="item.occurredAt.toISOString()" [title]="item.occurredAt | date: 'medium'">{{ ago(item.occurredAt) }}</time>
                </li>
              }
            </ul>
          </app-resource-state>
        </section>
      </div>

      <!-- Precios de combustibles (referencia CREG y MinEnergía) -->
      <section class="card stack" aria-labelledby="fp-title" data-testid="fuel-prices">
        <div class="head"><svg class="i ico" viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="icons.bolt" /></svg><div class="grow"><h2 id="fp-title">Precios de combustibles</h2></div><a routerLink="/plataforma/intelligence/energia" class="small" data-testid="fuel-detail">Ver detalle</a></div>
        <app-fuel-price-cards />
      </section>
    </div>
  `,
})
export class PlatformDashboardComponent {
  protected readonly dash = inject(PlatformDashboardFacade);
  private readonly session = inject(SessionStore);
  protected readonly userName = computed(() => this.session.user()?.fullName?.trim() ?? '');
  protected readonly icons = ICONS;
  protected readonly presets = PRESETS;
  protected readonly intel = inject(IntelligenceFacade);
  protected readonly today = new Date().toISOString().slice(0, 10);
  protected readonly customOpen = signal(false);
  protected readonly from = signal('');
  protected readonly to = signal(this.today);

  /** La dona se adapta al alto de la ventana para que el resumen quepa sin desplazarse. */
  /** El resumen muestra lo más reciente; el historial completo está en «Actividad y auditoría». */
  protected readonly recentActivity = computed(() => (this.dash.activity.data() ?? []).slice(0, 4));
  protected readonly periodValue = computed(() => {
    const range = this.dash.range();

    return this.customOpen() || range.kind === 'custom' ? 'custom' : String(range.days);
  });
  /** Empresas vigentes con al menos un tipo: cada una cuenta UNA vez aunque tenga varios tipos (los segmentos sí la cuentan en cada tipo). */
  protected readonly companiesWithType = computed(() => {
    const o = this.dash.admin.data()?.organizations;

    return o ? Math.max(0, o.total - o.withoutType) : null;
  });
  protected readonly typeSegments = computed<readonly DonutSegment[]>(() =>
    (this.dash.admin.data()?.organizations.byType ?? [])
      .filter((t) => t.count > 0)
      .map((t, index) => ({ label: t.name, detail: t.code, value: t.count, color: TYPE_COLORS[index % TYPE_COLORS.length] })),
  );
  /** Tipo con mayor participación (para la frase guía bajo la dona). */
  protected readonly topType = computed(() => {
    const segments = this.typeSegments();
    const total = segments.reduce((sum, t) => sum + t.value, 0);
    const top = [...segments].sort((a, b) => b.value - a.value)[0];

    return top && total ? { label: top.label, share: Math.round((top.value / total) * 100) } : null;
  });
  /** Ícono de cada tipo de acción pendiente. */
  protected actionIcon(key: string): string {
    const byKey: Readonly<Record<string, string>> = {
      memberships: this.icons.person, expiring: this.icons.clock, 'needs-admin': this.icons.users, 'without-type': this.icons.building,
      quota: this.icons.crown, 'waiting-admin': this.icons.mail, inactive: this.icons.building,
    };

    return byKey[key] ?? this.icons.bolt;
  }
  protected readonly rangeProblem = computed(() => {
    const from = this.from();
    const to = this.to();

    if (!from || !to) return 'Elige las dos fechas.';
    if (from > to) return 'La fecha inicial debe ser anterior a la final.';
    if ((new Date(to).getTime() - new Date(from).getTime()) / 86_400_000 > 365) return 'El rango máximo es de un año.';

    return '';
  });
  protected readonly rangeValid = computed(() => this.rangeProblem() === '');

  constructor() {
    this.dash.load();
    this.intel.loadSummary();
  }

  protected line = activityLine;
  protected activityIcon(item: Parameters<typeof activityLine>[0]): string {
    return ICONS[ACTIVITY_ICON[activityLine(item).icon]];
  }
  protected ago(moment: Date): string {
    return relativeTime(moment);
  }
  protected created(field: 'organizationsCreated' | 'usersRegistered'): number {
    return this.dash.trends.data()?.summary[field] ?? 0;
  }
  /** Variación porcentual del período sobre el total anterior; con base cero se informa el número de nuevos. */
  protected growth(total: number, field: 'organizationsCreated' | 'usersRegistered'): string | null {
    const trends = this.dash.trends.data();

    if (!trends) return null;

    const created = trends.summary[field];
    const base = total - created;

    if (created === 0) return '0%';

    return base > 0 ? `+${Math.round((created / base) * 100)}%` : `+${created}`;
  }
  protected share(part: number, total: number): string {
    return total > 0 ? `${Math.round((part / total) * 100)}%` : '—';
  }
  protected onPeriod(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;

    if (value === 'custom') {
      this.customOpen.set(true);
      return;
    }

    this.customOpen.set(false);
    this.dash.setRange({ kind: 'days', days: Number(value) as Preset });
  }
  protected applyCustom(): void {
    if (!this.rangeValid()) return;

    this.dash.setRange({ kind: 'custom', from: this.from(), to: this.to() } satisfies TrendRange);
  }
}
