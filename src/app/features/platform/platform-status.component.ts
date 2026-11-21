import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { interval } from 'rxjs';
import { ServiceHealth, ServiceStatus } from '../../domain/models/platform';
import { SourceHealth } from '../../domain/models/platform-admin';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { SERVICE_LABELS, relativeTime } from './platform-labels';
import { PlatformDashboardFacade } from './platform.facades';

/** El estado se vuelve a pedir cada minuto (el backend guarda SSO y directorio unos minutos, así que no sobrecarga al proveedor). */
const REFRESH_MS = 60_000;

const ICONS: Readonly<Record<string, string>> = {
  api: 'M4 5h16v5H4zM4 14h16v5H4zM8 7.5h.01M8 16.5h.01',
  db: 'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3zM4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6',
  sso: 'M6 11h12v9H6zM8 11V8a4 4 0 0 1 8 0v3',
  directory: 'M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM2 20a7 7 0 0 1 14 0M17 5a3.5 3.5 0 0 1 0 6M19 20a7 7 0 0 0-3-5.7',
  imports: 'M12 16V4M7 9l5-5 5 5M4 20h16',
};

const GROUPS: readonly { title: string; hint: string; ids: readonly string[] }[] = [
  { title: 'Aplicación', hint: 'El servicio que atiende a LoGyCO₂ y su base de datos.', ids: ['api', 'db'] },
  { title: 'Identidad corporativa', hint: 'Inicio de sesión y directorio de usuarios de LOGYCA.', ids: ['sso', 'directory'] },
  { title: 'Procesamiento', hint: 'Trabajos de carga y análisis de archivos.', ids: ['imports'] },
];

/** Cómo se comprueba cada servicio: qué confirma y qué NO (para no leer más de lo que la comprobación demuestra). */
const METHODS: readonly { id: string; name: string; how: string }[] = [
  { id: 'api', name: 'API de LoGyCO₂', how: 'Responde a /health/live. Confirma que el proceso está vivo.' },
  { id: 'db', name: 'PostgreSQL', how: 'La API consulta la base en /health. Confirma la conexión en este momento.' },
  { id: 'sso', name: 'SSO LOGYCA', how: 'Login real de la cuenta de servicio. No prueba el inicio de sesión de cada persona.' },
  { id: 'directory', name: 'Directorio corporativo', how: 'Consulta de solo lectura de una cuenta. No crea ni modifica usuarios.' },
  { id: 'imports', name: 'Procesamiento de archivos', how: 'Aún no existe un estado de trabajos que consultar.' },
];

/** Estado técnico de la plataforma: resumen global, servicios por grupo y cómo se verifica cada uno. */
@Component({
  selector: 'app-platform-status',
  imports: [ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      svg { fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; flex: none; }
      .top { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .top h1 { margin: 0; }
      .top p { margin: 4px 0 0; color: var(--c-mu); max-width: 620px; }
      .actions { display: flex; align-items: center; gap: 12px; }
      .stamp { display: inline-flex; align-items: center; gap: 7px; font-size: 0.78rem; color: var(--c-mu); }
      .live { width: 8px; height: 8px; border-radius: 50%; background: var(--c-primary); box-shadow: 0 0 0 0 color-mix(in srgb, var(--c-primary) 40%, transparent); animation: pulse 2s ease-out infinite; }
      @keyframes pulse { to { box-shadow: 0 0 0 8px transparent; } }
      .refresh { display: inline-flex; align-items: center; gap: 8px; }
      .refresh svg { width: 16px; height: 16px; }
      .refresh.busy svg { animation: spin 0.9s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }

      .summary { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 14px; padding: 12px 18px; border: 1px solid var(--c-bd); border-radius: 16px; background: var(--c-sf); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); position: relative; overflow: hidden; }
      .summary::before { content: ''; position: absolute; inset: 0 auto 0 0; width: 5px; background: var(--tone); }
      .summary .badge { display: grid; place-items: center; width: 44px; height: 44px; border-radius: 16px; background: var(--tone-soft); color: var(--tone); }
      .summary .badge svg { width: 30px; height: 30px; }
      .summary h2 { margin: 0; font-size: 1.15rem; letter-spacing: -0.02em; }
      .summary p { margin: 3px 0 0; font-size: 0.86rem; color: var(--c-mu); }
      .counts { display: flex; flex-wrap: wrap; gap: 8px; justify-content: flex-end; }
      .count { display: inline-flex; align-items: baseline; gap: 6px; padding: 7px 12px; border-radius: 12px; border: 1px solid var(--c-bd); background: var(--c-s2); font-size: 0.74rem; color: var(--c-mu); }
      .count b { font-size: 1.2rem; font-variant-numeric: tabular-nums; color: var(--c-head); }
      .count.on b { color: var(--tone); }

      .tone-up { --tone: var(--c-primary); --tone-soft: var(--c-primary-200); }
      .tone-degraded { --tone: #a86b00; --tone-soft: #fff3da; }
      .tone-down { --tone: #c0392b; --tone-soft: #fdeceb; }
      .tone-unverified { --tone: var(--c-gray-600); --tone-soft: var(--c-gray-100); }

      .group { display: flex; flex-direction: column; gap: 10px; }
      .group > header { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
      .group h2 { margin: 0; font-size: 0.98rem; letter-spacing: -0.01em; }
      .group header span { font-size: 0.78rem; color: var(--c-mu); }
      .cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
      .svc { position: relative; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; column-gap: 14px; row-gap: 8px; padding: 11px 16px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); box-shadow: 0 1px 2px color-mix(in srgb, var(--c-gray) 4%, transparent); transition: transform 0.15s, box-shadow 0.15s, border-color 0.15s; }
      .svc:hover { transform: translateY(-2px); border-color: var(--c-bd); box-shadow: 0 10px 22px color-mix(in srgb, var(--c-gray) 6%, transparent); }
      .svc .detail.when { margin-top: 0; font-size: 0.72rem; }
      .svc .ico { display: grid; place-items: center; width: 40px; height: 40px; border-radius: 13px; background: var(--tone-soft); color: var(--tone); }
      .svc .ico svg { width: 24px; height: 24px; }
      .svc strong { display: block; font-size: 0.95rem; color: var(--c-head); }
      .svc .detail { display: block; margin-top: 2px; font-size: 0.78rem; color: var(--c-mu); line-height: 1.4; }
      .pill { display: inline-flex; align-items: center; gap: 6px; padding: 3px 11px; border-radius: 999px; background: var(--tone-soft); color: var(--tone); font-size: 0.74rem; font-weight: 800; white-space: nowrap; }
      .pill::before { content: ''; width: 7px; height: 7px; border-radius: 50%; background: var(--tone); }
      .svc footer { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 10px; padding-top: 10px; border-top: 1px solid var(--c-bd); font-size: 0.72rem; color: var(--c-mu); }
      .svc.tone-down { border-color: #f1c9c6; }

      .refs { display: flex; flex-wrap: wrap; gap: 8px; margin: 0; padding: 0; list-style: none; }
      .refs .count { background: var(--c-sf); }
      .refs .count.bad b { color: var(--c-bad); }
      .refs .gain { color: var(--c-accent); font-weight: 700; } .refs .loss { color: var(--c-bad); font-weight: 700; }
      .method { padding: 10px 18px; }
      .method summary { cursor: pointer; list-style: none; }
      .method summary::-webkit-details-marker { display: none; }
      .method summary:focus-visible { outline: 3px solid var(--c-secondary-soft); border-radius: 8px; }
      .method summary h2 { display: inline; margin: 0; font-size: 0.98rem; }
      .method summary::after { content: ' ▾'; color: var(--c-mu); }
      .method[open] summary::after { content: ' ▴'; }
      .method > p { margin-top: 10px; }
      .method > p { margin: 0 0 12px; font-size: 0.8rem; color: var(--c-mu); }
      .method ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 10px 22px; }
      .method li { display: flex; gap: 10px; font-size: 0.8rem; color: var(--c-mu); line-height: 1.45; }
      .method li svg { width: 18px; height: 18px; margin-top: 1px; color: var(--c-accent); }
      .method li b { color: var(--c-head); }
      @media (max-width: 720px) { .summary { grid-template-columns: auto minmax(0, 1fr); } .counts { grid-column: 1 / -1; justify-content: flex-start; } }
      @media (prefers-reduced-motion: reduce) { .live, .refresh.busy svg { animation: none; } .svc { transition: none; } }
    `,
  ],
  template: `
    <div class="page">
      <header class="top">
        <div>
          <h1>Estado de la plataforma</h1>
          <p>Un servicio solo figura como operativo si el backend lo confirma en este momento. «No verificado» significa que no hay evidencia suficiente: servicio sin configurar o sin comprobación disponible.</p>
        </div>
        <div class="actions">
          @if (checkedAt(); as moment) { <span class="stamp" data-testid="checked-at"><i class="live"></i>Actualizado {{ ago(moment) }} · cada minuto</span> }
          <button type="button" class="btn btn-secondary refresh" [class.busy]="loading()" [disabled]="loading()" (click)="dash.checkServices()">
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 12a8 8 0 1 1-2.3-5.6M20 4v5h-5" /></svg>Verificar ahora
          </button>
        </div>
      </header>

      <app-resource-state [status]="dash.services.status()" [error]="dash.services.error()" (retry)="dash.checkServices()">
        <section class="summary" [class]="'summary tone-' + overall().tone" data-testid="status-summary" aria-live="polite">
          <span class="badge" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="overall().icon" /></svg></span>
          <div><h2>{{ overall().title }}</h2><p>{{ overall().text }}</p></div>
          <div class="counts" aria-label="Resumen por estado">
            @for (c of counts(); track c.status) { <span class="count" [class]="'count tone-' + c.tone" [class.on]="c.n > 0"><b>{{ c.n }}</b>{{ c.label }}</span> }
          </div>
        </section>

        @for (group of groups(); track group.title) {
          <section class="group" [attr.aria-label]="group.title">
            <header><h2>{{ group.title }}</h2><span>{{ group.hint }}</span></header>
            <div class="cards">
              @for (s of group.items; track s.id) {
                <article class="svc" [class]="'svc tone-' + tone(s.status)" [attr.data-service]="s.id">
                  <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon(s.id)" /></svg></span>
                  <div><strong>{{ s.name }}</strong><span class="detail">{{ s.detail }}</span><span class="detail when">{{ s.checkedAt ? 'Última verificación ' + ago(s.checkedAt) : 'Sin verificación' }}</span></div>
                  <span class="pill">{{ labels[s.status].text }}</span>
                </article>
              }
            </div>
          </section>
        }

        <section class="group" aria-labelledby="refs-title" data-testid="data-operation">
          <header><h2 id="refs-title">Actualización de datos de referencia</h2><span data-testid="data-operation-period">{{ refsPeriod() }}</span></header>
          <p class="hint">Trabajos que descargan cada fuente externa del módulo de Inteligencia (combustibles, costos del transporte y tráfico portuario). No son archivos de las empresas.</p>
          <app-resource-state [status]="dash.operations.status()" [error]="dash.operations.error()" (retry)="dash.loadOperations()">
            @if (dash.operations.data(); as o) {
              <ul class="refs" data-testid="data-operation-totals">
                <li class="count"><b>{{ o.processing.completed }}</b>completados@if (completedDelta(); as d) { <span [class.gain]="d.good" [class.loss]="!d.good" data-testid="do-delta">{{ d.text }}</span> }</li>
                <li class="count" [class.bad]="o.processing.failed > 0"><b>{{ o.processing.failed }}</b>fallidos</li>
                @if (o.blocked.count > 0) { <li class="count bad" data-testid="do-blocked"><b>{{ o.blocked.count }}</b>en curso hace más de {{ o.blockedAfterMinutes }} min</li> }
                <li class="count"><b>{{ p95() }}</b>duración P95</li>
                <li class="count"><b>{{ records(o.processing.recordsSeen) }}</b>registros leídos · {{ records(o.processing.inserted + o.processing.revised) }} nuevos o revisados</li>
              </ul>
              <div class="cards">
                @for (src of o.sources; track src.code) {
                  <article class="svc" [class]="'svc tone-' + sourceTone(src)" [attr.data-source]="src.code">
                    <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon('imports')" /></svg></span>
                    <div><strong>{{ src.name }}</strong><span class="detail">{{ sourceDetail(src) }}</span></div>
                    <span class="pill">{{ sourceLabel(src) }}</span>
                  </article>
                }
              </div>
            }
          </app-resource-state>
        </section>

        <details class="card method" data-testid="status-method">
          <summary><h2>Cómo se verifica cada servicio</h2></summary>
          <p>La disponibilidad de la API no implica la del SSO, la del directorio corporativo ni la del procesamiento de archivos: cada uno se comprueba por separado. El SSO y el directorio se consultan como máximo cada pocos minutos para no sobrecargar al proveedor.</p>
          <ul>
            @for (m of methods; track m.id) {
              <li><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8h.01M11 12h1v5h1" /></svg><span><b>{{ m.name }}.</b> {{ m.how }}</span></li>
            }
          </ul>
        </details>
      </app-resource-state>
    </div>
  `,
})
export class PlatformStatusComponent {
  protected readonly dash = inject(PlatformDashboardFacade);
  protected readonly labels = SERVICE_LABELS;
  protected readonly methods = METHODS;

  protected readonly loading = computed(() => this.dash.services.status() === 'loading');
  private readonly services = computed<readonly ServiceHealth[]>(() => this.dash.services.data() ?? []);
  protected readonly groups = computed(() =>
    GROUPS.map((group) => ({ ...group, items: group.ids.map((id) => this.services().find((s) => s.id === id)).filter((s): s is ServiceHealth => !!s) })).filter((g) => g.items.length > 0),
  );
  /** Momento de la comprobación más reciente de cualquier servicio. */
  protected readonly checkedAt = computed(() => {
    const times = this.services().flatMap((s) => (s.checkedAt ? [s.checkedAt.getTime()] : []));

    return times.length ? new Date(Math.max(...times)) : null;
  });
  protected readonly counts = computed(() =>
    (['UP', 'DEGRADED', 'DOWN', 'UNVERIFIED'] as const).map((status) => ({
      status,
      tone: this.tone(status),
      label: { UP: 'Operativos', DEGRADED: 'Degradados', DOWN: 'No disponibles', UNVERIFIED: 'Sin verificar' }[status],
      n: this.services().filter((s) => s.status === status).length,
    })),
  );
  protected readonly overall = computed(() => {
    const count = (status: ServiceStatus): number => this.services().filter((s) => s.status === status).length;
    const check = 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6';
    const alert = 'M12 3l10 18H2zM12 10v5M12 18h.01';

    if (count('DOWN') > 0) return { tone: 'down', icon: alert, title: 'Hay servicios no disponibles', text: `${count('DOWN')} servicio(s) no respondieron en la última comprobación. Revisa su detalle.` };
    if (count('DEGRADED') > 0) return { tone: 'degraded', icon: alert, title: 'Algunos servicios están degradados', text: `${count('DEGRADED')} servicio(s) responden, pero con restricciones. Revisa su detalle.` };
    if (count('UNVERIFIED') > 0) return { tone: 'unverified', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 8h.01M11 12h1v5h1', title: 'Sin incidencias detectadas', text: `${count('UNVERIFIED')} servicio(s) aún no tienen una comprobación disponible.` };

    return { tone: 'up', icon: check, title: 'Todos los servicios operativos', text: 'Todos los servicios respondieron correctamente en la última comprobación.' };
  });

  /** Período real de los trabajos: lo informa el servidor. */
  protected readonly refsPeriod = computed(() => {
    const period = this.dash.operations.data()?.period;

    return period ? `Últimos ${period.days} días` : '';
  });
  protected readonly p95 = computed(() => {
    const seconds = this.dash.operations.data()?.processing.durationP95Seconds ?? null;
    const fmt = new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 });

    return seconds === null ? '—' : seconds < 60 ? `${fmt.format(seconds)} s` : `${fmt.format(seconds / 60)} min`;
  });
  /** Variación de completados SOLO frente a un período anterior completo y mayor que cero. */
  protected readonly completedDelta = computed(() => {
    const o = this.dash.operations.data();

    if (!o || !o.period.previousComparable || o.previous.completed <= 0) return null;

    const pct = Math.round(((o.processing.completed - o.previous.completed) / o.previous.completed) * 100);

    return { text: `${pct > 0 ? '▲' : pct < 0 ? '▼' : '='} ${Math.abs(pct)} %`, good: pct >= 0 };
  });

  constructor() {
    this.dash.checkServices();
    this.dash.loadOperations();
    interval(REFRESH_MS).pipe(takeUntilDestroyed(inject(DestroyRef))).subscribe(() => {
      this.dash.checkServices();
      this.dash.loadOperations();
    });
  }

  protected records(value: number): string {
    return new Intl.NumberFormat('es-CO').format(value);
  }
  protected sourceTone(source: SourceHealth): string {
    return { OK: 'up', FAILING: 'down', NEVER_RUN: 'unverified' }[source.status];
  }
  protected sourceLabel(source: SourceHealth): string {
    return { OK: 'Al día', FAILING: 'Falló', NEVER_RUN: 'Sin intentos' }[source.status];
  }
  protected sourceDetail(source: SourceHealth): string {
    const success = source.lastSuccessAt ? `última actualización correcta ${relativeTime(source.lastSuccessAt)}` : 'nunca se actualizó correctamente';

    if (source.status === 'NEVER_RUN') return 'Aún no se ha ejecutado ningún trabajo.';

    return source.status === 'FAILING' ? `El último intento falló (${source.lastErrorCode ?? 'sin código'}) · ${success}` : success.charAt(0).toUpperCase() + success.slice(1);
  }

  protected tone(status: ServiceStatus): string {
    return { UP: 'up', DEGRADED: 'degraded', DOWN: 'down', UNVERIFIED: 'unverified' }[status];
  }
  protected icon(id: string): string {
    return ICONS[id] ?? ICONS['api'];
  }
  protected ago(moment: Date): string {
    return relativeTime(moment);
  }
}
