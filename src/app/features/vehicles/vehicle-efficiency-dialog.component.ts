import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { EfficiencyRecord, EstimatePreview, MeasuredProtection } from '../../domain/models/vehicle-efficiency';
import { Vehicle } from '../../domain/models/vehicles';
import { unitLabel } from '../../shared/ui/footprint.format';
import { StatusBadgeComponent } from '../../shared/ui/status-badge.component';
import { MAX_EFFICIENCY, positiveDecimal } from '../emissions/emissions.validators';
import { EfficiencyEstimationFacade } from './efficiency-estimation.facade';
import { VehicleEfficiencyFacade } from './vehicle-efficiency.facade';
import {
  BASIS_LABELS,
  EfficiencyKind,
  KIND_OPTIONS,
  ORIGIN_LABELS,
  appliedText,
  dayText,
  rawEfficiencyText,
  declarationOf,
  efficiencyErrorText,
  efficiencyText,
  estimateErrorText,
  estimateEvidenceText,
  estimatePreviewNote,
  estimateResultText,
  estimateText,
  estimateTheoreticalText,
  remainingText,
  STALLED_TEXT,
  staleText,
} from './vehicle-efficiency.view';
import { fuelLabel } from './vehicles.labels';
import { VEHICLE_LIMITS } from './vehicles.limits';

const GAUGE = 'M4 18a9 9 0 1 1 16 0M12 18l4-6M7 18h.01M17 18h.01M12 9v.01';

const MESSAGES: Readonly<Record<string, string>> = {
  required: 'Escribe el rendimiento.',
  number: 'Usa solo números, con coma o punto decimal.',
  positive: 'Debe ser mayor que 0.',
  max: `No puede superar ${MAX_EFFICIENCY}.`,
};

/** Hoy como «AAAA-MM-DD» en la hora local de la persona (tope de la fecha de medición; el servidor tiene la última palabra). */
const today = (): string => new Date().toLocaleDateString('en-CA');

/**
 * «Rendimiento del vehículo»: el valor vigente con su procedencia, su historia (de a 5) y, para quien administra vehículos, el formulario para
 * declararlo UNA vez por vehículo (aplica a sus viajes). La pantalla no calcula nada: muestra lo que el servidor recalculó y deja «Continuar» si
 * quedan viajes por examinar. Sin permiso de administrar, es una consulta.
 */
@Component({
  selector: 'app-vehicle-efficiency-dialog',
  imports: [ReactiveFormsModule, StatusBadgeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: contents; }
      dialog.eff { width: min(720px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100dvh - 24px); overflow: visible; border-radius: 16px; background: var(--c-sf); }
      dialog.eff[open] { display: block; }
      .hd { display: flex; align-items: center; gap: 12px; padding: 14px 20px; border-bottom: 1px solid var(--c-bd); border-radius: 16px 16px 0 0; background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); }
      .hd .ico { display: grid; place-items: center; flex: none; width: 40px; height: 40px; border-radius: 12px; background: var(--c-sf); color: var(--c-accent); }
      .hd .ico svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
      .hd .t { flex: 1 1 auto; min-width: 0; }
      .hd h2 { margin: 0; font-size: 1.1rem; letter-spacing: -0.01em; color: var(--c-head); }
      .hd h2:focus { outline: none; }
      .hd p { margin: 2px 0 0; font-size: 0.82rem; color: var(--c-mu); }
      .bd { display: grid; gap: 12px; padding: 14px 20px; }
      dl.facts { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px 16px; margin: 0; }
      dl.facts div { min-width: 0; }
      dl.facts dt { font-size: 0.74rem; color: var(--c-mu); }
      dl.facts dd { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; margin: 1px 0 0; font-weight: 650; color: var(--c-head); overflow-wrap: anywhere; }
      dl.facts dd small { font-weight: 400; font-size: 0.78rem; color: var(--c-mu); }
      .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 14px; }
      .grid .wide { grid-column: span 2; }
      .f { display: grid; gap: 3px; align-content: start; min-width: 0; }
      .f label { font-size: 0.8rem; font-weight: 600; color: var(--c-head); }
      .f .input { min-height: 36px; padding-block: 4px; }
      .f small { font-size: 0.72rem; color: var(--c-mu); }
      .f small.bad { color: var(--c-danger); font-weight: 600; }
      .ref { display: grid; gap: 4px; padding: 8px 12px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-s2); font-size: 0.82rem; color: var(--c-text2); }
      .ref p { margin: 0; }
      .ref .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
      .ref strong { color: var(--c-head); }
      .note { margin: 0; padding: 8px 12px; border-radius: 10px; background: var(--c-s2); font-size: 0.82rem; color: var(--c-text2); }
      .res { display: grid; gap: 6px; }
      .prot { display: grid; gap: 6px; padding: 10px 12px; border: 1px solid color-mix(in srgb, var(--c-warning) 40%, var(--c-bd)); border-radius: 12px; background: var(--c-warning-bg); }
      .prot p { margin: 0; font-size: 0.86rem; color: var(--c-text); }
      .prot .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
      .prot button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .res .alert { margin: 0; padding: 8px 12px; font-size: 0.84rem; }
      .res .alert p { margin: 0; }
      .res .row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; }
      h3 { margin: 0 0 4px; font-size: 0.7rem; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); }
      ol.hist { display: grid; gap: 4px; margin: 0; padding: 0; list-style: none; }
      ol.hist li { display: grid; grid-template-columns: auto auto minmax(0, 1fr); align-items: center; gap: 2px 10px; padding: 4px 10px; border: 1px solid var(--c-bd); border-radius: 10px; font-size: 0.82rem; }
      ol.hist li.cur { border-color: color-mix(in srgb, var(--c-primary) 40%, var(--c-bd)); background: var(--c-ok-soft); }
      ol.hist b { color: var(--c-head); white-space: nowrap; }
      ol.hist .m { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--c-mu); font-size: 0.78rem; }
      .pg { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 6px; font-size: 0.78rem; color: var(--c-mu); }
      .ft { display: flex; justify-content: flex-end; gap: 10px; padding: 10px 20px; border-top: 1px solid var(--c-bd); border-radius: 0 0 16px 16px; background: var(--c-s2); }
      @media (max-width: 719px) {
        dialog.eff { width: 100vw; max-width: 100vw; height: auto; max-height: 100dvh; margin: 0; border-radius: 0; overflow: hidden; }
        dialog.eff[open] { display: flex; flex-direction: column; }
        dialog.eff form { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; }
        .bd { flex: 1 1 auto; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
        .hd, .ft { flex: none; border-radius: 0; }
        dl.facts, .grid { grid-template-columns: 1fr; }
        .grid .wide { grid-column: auto; }
        ol.hist li { grid-template-columns: auto minmax(0, 1fr); }
        ol.hist .m { grid-column: 1 / -1; white-space: normal; }
      }
      @media (prefers-reduced-motion: reduce) { .btn { transition: none; } }
    `,
  ],
  template: `
    <dialog #dialog class="dialog eff" aria-labelledby="eff-title" (close)="onClosed()" (cancel)="onCancel($event)" data-testid="efficiency-dialog">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <header class="hd">
          <span class="ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="gauge" /></svg></span>
          <div class="t">
            <h2 id="eff-title">Rendimiento del vehículo</h2>
            <p>{{ vehicle().plate }}</p>
          </div>
        </header>

        <div class="bd">
          @if (view(); as v) {
            <dl class="facts" data-testid="efficiency-facts">
              <div><dt>Placa</dt><dd>{{ v.plate }}</dd></div>
              <div><dt>Combustible</dt><dd data-testid="efficiency-fuel">{{ fuelText(v.fuelType) }}</dd></div>
              <div>
                <dt>Rendimiento vigente</dt>
                @if (v.current; as c) {
                  <dd data-testid="efficiency-current">{{ valueText(c.value, c.unit) }}<app-status-badge [label]="originLabels[c.origin]" />@if (c.basis) { <small>{{ basisLabels[c.basis] }}</small> }<small>{{ day(c.measuredOn ?? c.declaredAt) }}</small></dd>
                } @else {
                  <dd class="muted" data-testid="efficiency-none">Sin rendimiento</dd>
                }
              </div>
            </dl>

            @if (v.estimationEnabled) {
              @if (v.estimate; as e) {
                <section class="ref" aria-labelledby="eff-ref-title" data-testid="efficiency-reference">
                  <h3 id="eff-ref-title">Referencia técnica</h3>
                  <p><strong data-testid="efficiency-reference-text">{{ refText(e) }}</strong></p>
                  <p data-testid="efficiency-reference-note">@if (e.licenceNotice) { <strong class="licence" data-testid="efficiency-reference-licence">{{ e.licenceNotice }}.</strong> } {{ theoreticalOf(e) }} {{ evidence(e) }}.</p>
                  @if (estimation.canEstimate() && estimation.modeOff()) {
                    <p class="note" role="note" data-testid="efficiency-estimation-off">La estimación está desactivada para tu empresa. Actívala en Configuración.</p>
                  } @else if (!estimation.canEstimate() && estimation.modeOff()) {
                    <p class="note" role="note" data-testid="efficiency-estimation-off">La estimación está desactivada para tu empresa.</p>
                  } @else if (estimation.canRun() && canUseReference()) {
                    <div class="row">
                      <button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-use-reference" [disabled]="estimation.busy() !== null || facade.busy()" (click)="estimation.useReference(v.vehicleId)">{{ estimation.busy() !== null ? 'Aplicando…' : 'Usar como estimado' }}</button>
                    </div>
                  }
                  @if (estimation.error(); as err) {
                    <div class="row" role="alert" data-testid="efficiency-reference-error"><p>{{ estimateError(err) }}</p>@if (estimation.stale()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-reference-retry" [disabled]="estimation.busy() !== null" (click)="estimation.reviewAgain()">Revisar de nuevo</button> } @else if (canRetry(err)) { <button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-reference-retry" [disabled]="estimation.busy() !== null" (click)="estimation.retry()">Reintentar</button> }</div>
                  }
                  @if (estimation.outcome(); as o) {
                    <div role="status" data-testid="efficiency-reference-result">
                      <p><strong>{{ estimateResult(o.result) }}</strong> {{ applied(o.result.applied, o.recalculated) }}</p>
                      @if (o.result.applied.remaining > 0 && o.stalled) {
                        <p data-testid="efficiency-reference-stalled">{{ stalledText }}</p>
                      } @else if (o.result.applied.remaining > 0) {
                        <div class="row"><p data-testid="efficiency-reference-remaining">{{ remaining(o.result.applied.remaining) }}</p><button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-reference-continue" [disabled]="estimation.busy() !== null" (click)="estimation.continue()">{{ estimation.busy() === 'apply' ? 'Continuando…' : 'Continuar' }}</button></div>
                      }
                      @if (o.result.applied.staleCalculatedTrips > 0) { <p>{{ stale(o.result.applied.staleCalculatedTrips) }}</p> }
                    </div>
                  } @else if (estimation.preview(); as p) {
                    @if (p.counts.toCreate === 0 && p.counts.toRetire === 0) {
                      <p data-testid="efficiency-reference-nothing">{{ previewNote(p) }}</p>
                    }
                  }
                </section>
              } @else if (v.estimateReason && v.estimateReason !== 'HAS_VEHICLE_EFFICIENCY' && v.estimateReasonLabel) {
                <p class="note" role="note" data-testid="efficiency-reference-reason">Sin referencia técnica: {{ v.estimateReasonLabel }}</p>
              }
            }

            @if (facade.canManage()) {
              @if (v.compatibleUnits.length === 0) {
                <p class="note" role="note" data-testid="efficiency-no-fuel">Este vehículo no tiene combustible registrado. Complétalo en su ficha para declarar el rendimiento.</p>
              } @else {
                <div class="grid">
                  <div class="f">
                    <label for="eff-value">Rendimiento *</label>
                    <input id="eff-value" #valueInput class="input" type="text" inputmode="decimal" autocomplete="off" formControlName="value" data-testid="efficiency-value" [attr.aria-invalid]="valueError() ? 'true' : null" [attr.aria-describedby]="valueError() ? 'eff-value-err' : 'eff-value-hint'" />
                    @if (valueError(); as e) { <small class="bad" id="eff-value-err" data-testid="efficiency-error-value">{{ e }}</small> } @else { <small id="eff-value-hint">Mayor que 0 y hasta {{ max }}</small> }
                  </div>
                  <div class="f">
                    <label for="eff-unit">Unidad *</label>
                    <select id="eff-unit" class="input" formControlName="unit" data-testid="efficiency-unit" [attr.aria-invalid]="unitError() ? 'true' : null" [attr.aria-describedby]="unitError() ? 'eff-unit-err' : null">
                      <option value="">Elegir</option>
                      @for (u of v.compatibleUnits; track u) { <option [value]="u">{{ unitText(u) }}</option> }
                    </select>
                    @if (unitError(); as e) { <small class="bad" id="eff-unit-err" data-testid="efficiency-error-unit">{{ e }}</small> }
                  </div>
                  <div class="f">
                    <label for="eff-kind">Tipo</label>
                    <select id="eff-kind" class="input" formControlName="kind" data-testid="efficiency-kind">
                      @for (k of kinds; track k.value) { <option [value]="k.value">{{ k.label }}</option> }
                    </select>
                  </div>
                  <div class="f">
                    <label for="eff-date">Fecha de medición</label>
                    <input id="eff-date" class="input" type="date" formControlName="measuredOn" min="1990-01-01" [max]="maxDate" data-testid="efficiency-date" [attr.aria-invalid]="dateError() ? 'true' : null" [attr.aria-describedby]="dateError() ? 'eff-date-err' : null" />
                    @if (dateError(); as e) { <small class="bad" id="eff-date-err" data-testid="efficiency-error-date">{{ e }}</small> }
                  </div>
                  <div class="f wide">
                    <label for="eff-note">Fuente o nota</label>
                    <input id="eff-note" class="input" type="text" autocomplete="off" formControlName="note" [attr.maxlength]="limits.efficiencyNoteMax" data-testid="efficiency-note" [attr.aria-invalid]="noteError() ? 'true' : null" [attr.aria-describedby]="noteError() ? 'eff-note-err' : null" />
                    @if (noteError(); as e) { <small class="bad" id="eff-note-err" data-testid="efficiency-error-note">{{ e }}</small> }
                  </div>
                </div>
              }
            } @else {
              <p class="note" role="note" data-testid="efficiency-readonly">Solo quien administra los vehículos puede declarar el rendimiento.</p>
            }

            @if (facade.protection(); as prot) {
              <section class="prot" role="alertdialog" aria-labelledby="eff-prot-title" aria-describedby="eff-prot-text" data-testid="efficiency-protected">
                <h3 id="eff-prot-title">Rendimiento medido vigente</h3>
                <p id="eff-prot-text" data-testid="efficiency-protected-text">{{ protectedText(prot) }}</p>
                <div class="row">
                  <button type="button" #keepButton class="btn btn-secondary btn-sm" data-testid="efficiency-keep-measured" [disabled]="facade.busy()" (click)="keepMeasured()">Conservar el medido</button>
                  <button type="button" class="btn btn-primary btn-sm" data-testid="efficiency-replace-measured" [disabled]="facade.busy()" (click)="facade.confirmReplace()">{{ facade.busy() ? 'Reemplazando…' : 'Reemplazar por el declarado' }}</button>
                </div>
              </section>
            }

            <div class="res">
              @if (facade.error(); as e) {
                <div class="alert alert-danger" role="alert" data-testid="efficiency-error">
                  <div class="row"><p>{{ errorText(e) }}</p>@if (retryable()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-retry" (click)="facade.retry()">Reintentar</button> }</div>
                </div>
              }
              @if (facade.outcome(); as o) {
                <div class="alert alert-success" role="status" data-testid="efficiency-result">
                  <div class="stack" style="gap: 2px">
                    <p><strong>{{ o.changed ? 'Rendimiento guardado.' : 'Ese valor ya estaba vigente: no se creó otro registro.' }}</strong> {{ applied(o.applied, o.recalculated) }}</p>
                    @if (o.applied.remaining > 0 && o.stalled) {
                      <p data-testid="efficiency-stalled">{{ stalledText }}</p>
                    } @else if (o.applied.remaining > 0) {
                      <div class="row"><p data-testid="efficiency-remaining">{{ remaining(o.applied.remaining) }}</p><button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-continue" [disabled]="facade.busy()" (click)="facade.continue()">{{ facade.busy() ? 'Continuando…' : 'Continuar' }}</button></div>
                    }
                    @if (o.applied.staleCalculatedTrips > 0) { <p data-testid="efficiency-stale">{{ stale(o.applied.staleCalculatedTrips) }}</p> }
                  </div>
                </div>
              }
            </div>

            <section aria-labelledby="eff-hist-title">
              <h3 id="eff-hist-title">Historial</h3>
              @if (v.history.items.length === 0) {
                <p class="muted small" data-testid="efficiency-history-empty">Todavía no hay rendimientos declarados.</p>
              } @else {
                <ol class="hist" data-testid="efficiency-history">
                  @for (r of v.history.items; track r.id) {
                    <li [class.cur]="r.isCurrent" [attr.title]="r.note">
                      <b>{{ valueText(r.value, r.unit) }}</b>
                      <app-status-badge [label]="originLabels[r.origin]" />
                      <span class="m">{{ recordMeta(r) }}</span>
                    </li>
                  }
                </ol>
                @if (v.history.totalPages > 1) {
                  <nav class="pg" aria-label="Páginas del historial">
                    <button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-prev" [disabled]="!v.history.hasPrevious || loading()" (click)="facade.loadHistory(v.history.page - 1)">Anterior</button>
                    <span role="status">{{ range(v.history.page, v.history.pageSize, v.history.items.length, v.history.total) }}</span>
                    <button type="button" class="btn btn-secondary btn-sm" data-testid="efficiency-next" [disabled]="!v.history.hasNext || loading()" (click)="facade.loadHistory(v.history.page + 1)">Siguiente</button>
                  </nav>
                }
              }
            </section>
          } @else if (facade.view.status() === 'error') {
            <div class="alert alert-danger" role="alert" data-testid="efficiency-load-error">
              <div class="row"><p>{{ facade.view.error()?.message }}</p><button type="button" class="btn btn-secondary btn-sm" (click)="facade.loadHistory(1)">Reintentar</button></div>
            </div>
          } @else {
            <div class="stack" role="status" aria-busy="true"><span class="sr-only">Cargando…</span><span class="skeleton" style="height: 60px"></span><span class="skeleton" style="height: 120px"></span></div>
          }
        </div>

        <footer class="ft">
          <button type="button" class="btn btn-secondary" data-testid="efficiency-close" (click)="dialog.close()">Cerrar</button>
          @if (facade.canManage() && view()?.compatibleUnits?.length) {
            <button type="submit" class="btn btn-primary" data-testid="efficiency-save" [disabled]="facade.busy() || !!facade.protection()">{{ facade.busy() && !facade.outcome() ? 'Guardando…' : 'Guardar' }}</button>
          }
        </footer>
      </form>
    </dialog>
  `,
})
export class VehicleEfficiencyDialogComponent {
  protected readonly facade = inject(VehicleEfficiencyFacade);
  protected readonly estimation = inject(EfficiencyEstimationFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keepButton');
  private readonly valueInput = viewChild<ElementRef<HTMLInputElement>>('valueInput');

  /** La fila elegida: da la placa mientras llega la historia. */
  readonly vehicle = input.required<Vehicle>();
  readonly closed = output();

  protected readonly gauge = GAUGE;
  protected readonly kinds = KIND_OPTIONS;
  protected readonly originLabels = ORIGIN_LABELS;
  protected readonly limits = VEHICLE_LIMITS;
  protected readonly max = MAX_EFFICIENCY;
  protected readonly maxDate = today();
  protected readonly view = computed(() => this.facade.view.data());
  protected readonly loading = computed(() => this.facade.view.status() === 'loading');
  /** «Reintentar» solo donde repetir lo mismo tiene sentido: hay una carga procesándose o no hubo conexión. */
  protected readonly retryable = computed(() => ['COMPANY_BUSY', 'EFFICIENCY_APPLY_TOO_LARGE'].includes(this.facade.error()?.code ?? '') || this.facade.error()?.kind === 'network');

  protected readonly form = new FormGroup({
    value: new FormControl('', { nonNullable: true, validators: [positiveDecimal(MAX_EFFICIENCY)] }),
    unit: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    kind: new FormControl<EfficiencyKind>('', { nonNullable: true }),
    measuredOn: new FormControl('', { nonNullable: true }),
    note: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(VEHICLE_LIMITS.efficiencyNoteMax)] }),
  });

  protected readonly fuelText = fuelLabel;
  protected readonly valueText = efficiencyText;
  protected readonly unitText = unitLabel;
  protected readonly basisLabels = BASIS_LABELS;
  protected readonly day = dayText;
  protected readonly applied = appliedText;
  protected readonly remaining = remainingText;
  protected readonly stalledText = STALLED_TEXT;
  protected readonly stale = staleText;
  protected readonly errorText = efficiencyErrorText;
  protected readonly theoreticalOf = estimateTheoreticalText;
  protected readonly refText = estimateText;
  protected readonly evidence = estimateEvidenceText;
  protected readonly estimateResult = estimateResultText;
  protected readonly estimateError = estimateErrorText;
  /** Un valor declarado o medido gana siempre: el botón solo existe si el vehículo no lo tiene (el servidor también lo conserva). */
  protected readonly canUseReference = computed(() => {
    const current = this.view()?.current;

    return !current || current.origin === 'ESTIMATED';
  });

  constructor() {
    effect(() => {
      const dialog = this.dialog().nativeElement;

      // showModal() mueve el foco al diálogo; al cerrarse el navegador lo devuelve a quien lo abrió.
      if (!dialog.open) dialog.showModal();
    });
    effect(() => {
      const id = this.vehicle().id;

      untracked(() => this.facade.open(id));
    });
    // Con la historia a la vista: la unidad del vigente (o la única posible) queda elegida y el foco va al valor.
    effect(() => {
      const view = this.view();

      if (!view) return;

      untracked(() => {
        const unit = this.form.controls.unit;

        if (!unit.value) unit.setValue(view.current && view.compatibleUnits.includes(view.current.unit) ? view.current.unit : view.compatibleUnits.length === 1 ? view.compatibleUnits[0] : '');
      });
    });
    // La sugerencia solo se ofrece si el servidor dice que la estimación está encendida.
    effect(() => {
      const view = this.view();

      if (view) untracked(() => this.estimation.learn(view.estimationEnabled));
    });
    effect(() => this.valueInput()?.nativeElement.focus());
    // La confirmación pide una decisión: el foco va a la opción segura («Conservar el medido»).
    effect(() => this.keepButton()?.nativeElement.focus());
    // Guardado: se limpia lo escrito (el vigente ya lo muestra) y se conserva la unidad y el tipo.
    effect(() => {
      if (!this.facade.outcome()) return;

      untracked(() => {
        this.form.patchValue({ value: '', measuredOn: '', note: '' });
        this.form.markAsUntouched();
      });
    });
  }

  /** «Este vehículo tiene un rendimiento medido de {valor} {unidad} del {fecha}…»; los datos son del servidor (sin ellos, el aviso general). */
  protected protectedText(prot: MeasuredProtection): string {
    const measured = prot.value && prot.unit ? `un rendimiento medido de ${rawEfficiencyText(prot.value, prot.unit)}${prot.measuredOn ? ` del ${dayText(prot.measuredOn)}` : ''}` : 'un rendimiento medido vigente';

    return `Este vehículo tiene ${measured}. ¿Quieres reemplazarlo por el declarado?`;
  }

  /** Lo escrito se conserva: el foco vuelve al valor para corregirlo o declarar otra cosa. */
  protected keepMeasured(): void {
    this.facade.keepMeasured();
    queueMicrotask(() => this.valueInput()?.nativeElement.focus());
  }

  protected submit(): void {
    if (this.facade.busy() || !this.facade.canManage()) return;

    this.form.markAllAsTouched();

    if (this.form.invalid) {
      this.dialog().nativeElement.querySelector<HTMLElement>('input.ng-invalid, select.ng-invalid')?.focus();

      return;
    }

    const { value, unit, kind, measuredOn, note } = this.form.getRawValue();
    this.facade.declare(declarationOf(kind, { value: value.trim().replace(',', '.'), unit, note: note.trim() || null, measuredOn: measuredOn || null }));
  }

  protected valueError(): string | null {
    const control = this.form.controls.value;
    const server = this.facade.fieldErrors()['value'];

    if (control.touched && control.errors) return MESSAGES[Object.keys(control.errors)[0]] ?? null;

    return server ?? null;
  }

  protected unitError(): string | null {
    return this.form.controls.unit.touched && this.form.controls.unit.errors ? 'Elige la unidad.' : (this.facade.fieldErrors()['unit'] ?? null);
  }

  protected dateError(): string | null {
    const value = this.form.controls.measuredOn.value;

    if (value && (value > this.maxDate || value < '1990-01-01')) return value > this.maxDate ? 'La fecha no puede ser futura.' : 'La fecha es demasiado antigua.';

    return this.facade.fieldErrors()['measured_on'] ?? null;
  }

  protected noteError(): string | null {
    return this.form.controls.note.errors ? `Máximo ${VEHICLE_LIMITS.efficiencyNoteMax} caracteres.` : (this.facade.fieldErrors()['note'] ?? null);
  }

  /** «Declarado el 12/11/2026 por Ana · medido el 01/11/2026 · nota». */
  protected recordMeta(record: EfficiencyRecord): string {
    return [
      record.basis ? BASIS_LABELS[record.basis] : null,
      `${dayText(record.declaredAt)}${record.declaredByName ? ` · ${record.declaredByName}` : ''}`,
      record.measuredOn ? `medido el ${dayText(record.measuredOn)}` : null,
      record.note,
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected range(page: number, size: number, count: number, total: number): string {
    return `${(page - 1) * size + 1}–${(page - 1) * size + count} de ${total}`;
  }

  /** Mientras guarda no se cierra con Escape: la petición sigue y la persona perdería el resultado. */
  protected onCancel(event: Event): void {
    if (this.facade.busy() || this.estimation.busy() !== null) event.preventDefault();
  }

  protected canRetry(error: { code: string; kind?: string }): boolean {
    return ['COMPANY_BUSY', 'EFFICIENCY_APPLY_TOO_LARGE'].includes(error.code) || error.kind === 'network';
  }

  /** Lo que dijo la vista previa cuando no hay nada que guardar: motivos del servidor o que ya había valor. */
  protected previewNote(preview: EstimatePreview): string {
    return estimatePreviewNote(preview);
  }

  protected onClosed(): void {
    this.estimation.close();
    this.facade.close();
    this.closed.emit();
  }
}
