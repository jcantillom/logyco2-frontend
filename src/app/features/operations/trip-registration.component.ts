import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, output, signal, untracked, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ComboOption, ComboboxComponent } from '../../shared/ui/combobox.component';
import { unitLabel } from '../../shared/ui/footprint.format';
import { TripRegistrationFacade } from './trip-registration.facade';
import { dayText, distanceText, kgText, routeText } from './operations.view';
import { lastEfficiencyText, registrationErrorText, resultHeadline, routeLine, vehicleEfficiencyText } from './registration.view';

const SWAP_ICON = 'M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7';

/**
 * «Registrar viaje»: diálogo compacto con el formulario breve de un viaje manual (dos columnas, sin scroll a 1280×800), el aviso de «viaje repetido» y el resultado que calculó el servidor.
 * Teclado primero: el foco va al primer campo, `Enter` guarda, `Alt+Enter` guarda y registra otro, `Escape` cierra (con confirmación solo si hay algo escrito). El estado vive en `TripRegistrationFacade`.
 */
@Component({
  selector: 'app-trip-registration',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ComboboxComponent, RouterLink],
  styles: [
    `
      dialog.reg { width: min(780px, calc(100vw - var(--dlg-left, 0px) - 32px)); max-height: calc(100dvh - 24px); overflow: visible; border-radius: 16px; background: var(--c-sf); }
      .rh { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 18px; border-bottom: 1px solid var(--c-bd); }
      .rh h2 { margin: 0; font-size: 1.1rem; font-weight: 750; color: var(--c-head); }
      h2:focus, h3:focus { outline: none; }
      .x { display: grid; place-items: center; width: 32px; height: 32px; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); color: var(--c-head); cursor: pointer; }
      .x:hover { background: var(--c-s2); border-color: var(--c-primary); }
      .x:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .x svg { width: 16px; height: 16px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; }
      .bd { display: grid; gap: 10px; padding: 12px 18px; }
      .cols { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; align-items: start; }
      .col { display: grid; gap: 8px; align-content: start; min-width: 0; }
      h3 { margin: 0; font-size: 0.74rem; font-weight: 700; letter-spacing: 0.04em; text-transform: uppercase; color: var(--c-accent); }
      .f { display: grid; gap: 2px; min-width: 0; }
      .f > label, .f > .cap, legend { padding: 0; font-size: 0.78rem; font-weight: 650; color: var(--c-head); }
      .f .input { width: 100%; box-sizing: border-box; min-height: 36px; padding-block: 4px; }
      .f small { font-size: 0.72rem; line-height: 1.25; color: var(--c-mu); }
      .f small.bad { font-weight: 600; color: var(--c-danger); }
      .meta { display: flex; flex-wrap: wrap; align-items: center; gap: 2px 8px; font-size: 0.74rem; color: var(--c-mu); }
      .meta .tag { padding: 0 8px; border-radius: 999px; background: var(--c-warning-bg); color: var(--c-warning); font-weight: 700; }
      .path { display: grid; grid-template-columns: minmax(0, 1fr) 34px; column-gap: 6px; align-items: center; }
      .path .f:first-child { grid-row: 1; grid-column: 1; }
      .path .f:last-child { grid-row: 2; grid-column: 1; margin-top: 6px; }
      .swap { grid-row: 1 / span 2; grid-column: 2; display: grid; place-items: center; width: 34px; height: 34px; margin-top: 18px; border: 1px solid var(--c-bd); border-radius: 50%; background: var(--c-sf); color: var(--c-head); cursor: pointer; }
      .swap:hover { background: var(--c-s2); border-color: var(--c-primary); }
      .swap:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .swap svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; transform: rotate(90deg); }
      .dist { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-height: 22px; font-size: 0.84rem; color: var(--c-head); }
      .dist b { font-weight: 700; }
      .link { all: unset; box-sizing: border-box; cursor: pointer; font-size: 0.78rem; font-weight: 650; color: var(--c-accent); text-decoration: underline; }
      .link:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 4px; }
      .link:disabled { cursor: not-allowed; opacity: 0.6; }
      .seg { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; margin: 0; padding: 3px; min-width: 0; border: 0; border-radius: 10px; background: var(--c-s3); }
      .seg legend { position: absolute; width: 1px; height: 1px; overflow: clip; clip-path: inset(50%); }
      .seg label { position: relative; display: grid; place-items: center; min-height: 32px; padding: 0 8px; border-radius: 8px; font-size: 0.84rem; font-weight: 650; color: var(--c-text2); cursor: pointer; text-align: center; }
      .seg label.on { background: var(--c-sf); color: var(--c-accent); box-shadow: 0 1px 3px color-mix(in srgb, var(--c-head) 14%, transparent), inset 0 -2px 0 var(--c-primary); }
      .seg input { position: absolute; inset: 0; opacity: 0; margin: 0; cursor: pointer; }
      .seg label:has(input:focus-visible) { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .pairs { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 8px; }
      .warn { margin: 0; padding: 5px 9px; border-radius: 8px; background: var(--c-warning-bg); color: var(--c-warning); font-size: 0.76rem; line-height: 1.3; }
      .banner { margin: 0; font-size: 0.8rem; font-weight: 650; color: var(--c-accent); }
      .saved { margin: 0; padding: 6px 10px; border-radius: 8px; background: var(--c-success-bg); color: var(--c-success); font-size: 0.82rem; font-weight: 650; }
      .alert { margin: 0; padding: 8px 10px; font-size: 0.82rem; }
      .ft { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; padding: 10px 18px; border-top: 1px solid var(--c-bd); background: var(--c-s2); border-radius: 0 0 16px 16px; }
      .ft .btn { min-height: 36px; padding: 0 14px; font-size: 0.88rem; }
      .ft .ask { margin-right: auto; font-size: 0.84rem; font-weight: 650; color: var(--c-head); }
      .spin { display: inline-block; width: 14px; height: 14px; margin-right: 6px; vertical-align: -2px; border: 2px solid color-mix(in srgb, currentColor 40%, transparent); border-top-color: currentColor; border-radius: 50%; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .done { display: grid; gap: 6px; padding: 14px 18px; }
      .done .msg { margin: 0; font-size: 1.25rem; font-weight: 750; line-height: 1.25; color: var(--c-head); }
      .done .sub { margin: 0; font-size: 0.86rem; color: var(--c-text2); }
      .cmp { width: 100%; border-collapse: collapse; font-size: 0.82rem; }
      .cmp th { padding: 4px 6px; text-align: left; font-size: 0.72rem; font-weight: 700; color: var(--c-mute2); border-bottom: 1px solid var(--c-bd); }
      .cmp td { padding: 5px 6px; border-bottom: 1px solid color-mix(in srgb, var(--c-bd) 40%, transparent); color: var(--c-head); }
      .cmp tr.new td { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); font-weight: 650; }
      .cmp .num { text-align: right; font-variant-numeric: tabular-nums; }
      .chip { display: inline-flex; padding: 1px 8px; border-radius: 999px; background: var(--c-info-bg); color: var(--c-info); font-size: 0.72rem; font-weight: 700; white-space: nowrap; }
      .skel i { display: block; height: 14px; margin: 14px 0; border-radius: 6px; background: linear-gradient(90deg, var(--c-s3) 25%, var(--c-s2) 50%, var(--c-s3) 75%); background-size: 200% 100%; animation: shimmer 1.2s linear infinite; }
      @keyframes shimmer { to { background-position: -200% 0; } }
      @media (max-width: 719px) {
        /* Excepción deliberada a «sin scroll», SOLO en teléfono: el cuerpo se desplaza y el pie con «Guardar» queda siempre a la vista (un modal no deja desplazar la página). */
        dialog.reg { width: 100vw; max-width: 100vw; height: auto; max-height: 100dvh; margin: 0; border-radius: 0; overflow: hidden; }
        dialog.reg[open] { display: flex; flex-direction: column; }
        dialog.reg form { display: flex; flex: 1 1 auto; flex-direction: column; min-height: 0; }
        .bd, .done { flex: 1 1 auto; min-height: 0; overflow-y: auto; }
        .rh, .ft { flex: none; }
        .cols { grid-template-columns: minmax(0, 1fr); gap: 10px; }
        .ft { border-radius: 0; }
        .ft .btn { flex: 1 1 auto; }
      }
      @media (prefers-reduced-motion: reduce) { .skel i, .spin { animation: none; } }
    `,
  ],
  template: `
    <dialog #dialog class="dialog reg" aria-labelledby="reg-title" data-testid="registration-dialog" (cancel)="onCancel($event)">
      <div class="rh">
        <h2 id="reg-title" tabindex="-1" #title>Registrar viaje</h2>
        <button type="button" class="x" aria-label="Cerrar" data-testid="reg-close" (click)="requestClose()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
      </div>

      @switch (facade.step()) {
        @case ('repeated') {
          <div class="bd" data-testid="reg-repeated">
            <h3 id="reg-repeated-title" tabindex="-1" #stepTitle>¿Es otro viaje?</h3>
            <p class="sub" role="alert">Ya hay un viaje de ese vehículo, en esa fecha y con esa ruta. Si es otro viaje, confírmalo; si no, no lo registres otra vez.</p>
            <table class="cmp" data-testid="reg-compare">
              <caption class="sr-only">Comparación del viaje nuevo con los ya registrados</caption>
              <thead><tr><th scope="col">Viaje</th><th scope="col">Fecha</th><th scope="col">Placa</th><th scope="col">Ruta</th><th scope="col">Estado</th><th scope="col">Origen</th><th scope="col" class="num">kg CO₂</th><th scope="col"><span class="sr-only">Acciones</span></th></tr></thead>
              <tbody>
                <tr class="new" data-testid="reg-compare-new"><td>Nuevo</td><td>{{ day(facade.date()) }}</td><td>{{ facade.vehicle()?.plate }}</td><td>{{ facade.origin()?.label }} → {{ facade.destination()?.label }}</td><td>—</td><td>Manual</td><td class="num">—</td><td></td></tr>
                @for (c of facade.candidates(); track c.id) {
                  <tr data-testid="reg-candidate">
                    <td>{{ c.tripId ?? 'Sin ID' }}</td><td>{{ day(c.tripDate) }}</td><td>{{ c.plate ?? '—' }}</td><td>{{ path(c.origin, c.destination) }}</td>
                    <td><span class="chip">{{ c.stateLabel }}</span></td><td>{{ c.source === 'MANUAL' ? 'Manual' : 'Archivo' }}</td><td class="num">{{ kg(c.kgCo2) }}</td>
                    <td>@if (facade.candidates().length > 1) { <button type="button" class="link" [attr.aria-label]="'Revisar el viaje ' + (c.tripId ?? '')" data-testid="reg-review-row" (click)="review.emit(c.id)">Revisar</button> }</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (facade.error(); as e) { <p class="alert alert-danger" role="alert" data-testid="reg-error">{{ errorText(e) }}</p> }
          </div>
          <div class="ft">
            <button type="button" class="btn btn-ghost" data-testid="reg-back" [disabled]="facade.saving()" (click)="facade.backToForm()">Volver al formulario</button>
            @if (facade.candidates().length === 1) { <button type="button" class="btn btn-secondary" data-testid="reg-review" (click)="review.emit(facade.candidates()[0].id)">Revisar el existente</button> }
            <button type="button" class="btn btn-primary" data-testid="reg-distinct" [disabled]="facade.saving()" [attr.aria-busy]="facade.saving()" (click)="facade.confirmDistinct()">{{ facade.saving() ? 'Guardando…' : 'Es otro viaje distinto' }}</button>
          </div>
        }
        @case ('saved') {
          @if (facade.outcome(); as o) {
            <div class="done" data-testid="reg-saved">
              <h3 id="reg-saved-title" tabindex="-1" #stepTitle>{{ o.created ? 'Viaje registrado' : 'Este viaje ya estaba registrado' }}</h3>
              <p class="msg" data-testid="reg-result">{{ headline(o.result) }}</p>
              @if (o.result.methodLabel) { <p class="sub" data-testid="reg-method">Método: {{ o.result.methodLabel }}</p> }
              <p class="sub">{{ o.trip.tripId ?? 'Viaje' }} · {{ o.trip.plate }} · {{ path(o.trip.origin, o.trip.destination) }} · {{ day(o.trip.tripDate) }}</p>
              @if (!o.created) { <p class="sub" data-testid="reg-replay">Es el resultado del viaje original: no se creó uno nuevo.</p> }
              @if (o.result.countedNote; as note) { <p class="warn" data-testid="reg-note">{{ note }} <a routerLink="/calidad" data-testid="reg-quality-link" (click)="closed.emit()">Ir a Calidad de datos</a></p> }
            </div>
            <div class="ft">
              <button type="button" class="btn btn-ghost" data-testid="reg-detail" (click)="detail.emit(o.trip.id)">Ver el viaje</button>
              @if (o.result.status === 'PENDING' && o.result.completable) { <button type="button" class="btn btn-secondary" data-testid="reg-complete" (click)="complete.emit(o.trip.id)">Completar datos</button> }
              <button type="button" class="btn btn-secondary" data-testid="reg-another" (click)="facade.registerAnother()">Registrar otro viaje</button>
              <button type="button" class="btn btn-primary" data-testid="reg-done" (click)="closed.emit()">Listo</button>
            </div>
          }
        }
        @default {
          @switch (facade.options.status()) {
            @case ('error') {
              <div class="bd">
                <p class="alert alert-danger" role="alert" data-testid="reg-options-error">{{ facade.options.error()?.message ?? 'No se pudo cargar el formulario.' }}</p>
              </div>
              <div class="ft">
                <button type="button" class="btn btn-ghost" (click)="closed.emit()">Cancelar</button>
                <button type="button" class="btn btn-primary" data-testid="reg-options-retry" (click)="facade.retryOptions()">Reintentar</button>
              </div>
            }
            @case ('ready') {
              <form (submit)="onSubmit($event)" novalidate data-testid="reg-form" [attr.aria-busy]="facade.saving() || facade.prefilling()">
                <div class="bd">
                  @if (facade.banner(); as b) { <p class="banner" data-testid="reg-banner">{{ b }}</p> }
                  @if (facade.notice(); as n) { <p class="warn" role="note" data-testid="reg-notice">{{ n }}</p> }
                  @if (facade.lastSaved(); as l) { <p class="saved" role="status" data-testid="reg-last-saved">Guardado. {{ headline(l.result) }}</p> }
                  <div class="cols">
                    <section class="col" aria-labelledby="reg-trip-h">
                      <h3 id="reg-trip-h">Viaje</h3>
                      <div class="f">
                        <label for="reg-date">Fecha</label>
                        <input id="reg-date" class="input" type="date" required [attr.min]="facade.options.data()?.minDate" [attr.max]="facade.options.data()?.maxDate" [value]="facade.date()" [disabled]="busy()" [attr.aria-invalid]="err('date') ? 'true' : null" [attr.aria-describedby]="err('date') ? 'reg-date-err' : null" data-testid="reg-date" (input)="facade.setDate(read($event))" />
                        @if (err('date'); as e) { <small class="bad" id="reg-date-err" data-testid="reg-error-date">{{ e }}</small> }
                      </div>
                      <div class="f">
                        <label for="reg-vehicle">Vehículo</label>
                        <app-combobox inputId="reg-vehicle" testId="reg-vehicle" placeholder="Placa" emptyText="No hay vehículos con esa placa" [required]="true" [disabled]="busy()" [text]="facade.vehicleText()" [options]="vehicleOptions()" [loading]="facade.vehicles.loading()" [invalid]="!!err('vehicle')" [describedBy]="err('vehicle') ? 'reg-vehicle-err' : null" (typed)="facade.typeVehicle($event)" (opened)="facade.openVehicles()" (picked)="facade.pickVehicle($event)" />
                        @if (facade.vehicle(); as v) {
                          <span class="meta" data-testid="reg-vehicle-info">@if (v.configuration) { <span>{{ v.configuration }}</span>{{ ' ' }} }@if (v.fuelLabel) { <span>{{ v.fuelLabel }}</span>{{ ' ' }} }@if (!v.active) { <span class="tag">Inactivo</span> }</span>
                        }
                        @if (err('vehicle'); as e) { <small class="bad" id="reg-vehicle-err" data-testid="reg-error-vehicle">{{ e }}</small> }
                      </div>
                      <div class="path">
                        <div class="f">
                          <label for="reg-origin">Origen</label>
                          <app-combobox inputId="reg-origin" testId="reg-origin" placeholder="Municipio" emptyText="No hay municipios con ese nombre" [required]="true" [disabled]="busy()" [text]="facade.originText()" [options]="placeOptions('origin')" [loading]="facade.places.loading()" [invalid]="!!err('origin')" [describedBy]="err('origin') ? 'reg-origin-err' : null" (typed)="facade.typePlace('origin', $event)" (opened)="facade.openPlaces('origin')" (picked)="facade.pickPlace('origin', $event)" />
                          @if (err('origin'); as e) { <small class="bad" id="reg-origin-err" data-testid="reg-error-origin">{{ e }}</small> }
                        </div>
                        <button type="button" class="swap" aria-label="Intercambiar origen y destino" title="Intercambiar origen y destino" data-testid="reg-swap" [disabled]="busy()" (click)="facade.swap()"><svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="swapIcon" /></svg></button>
                        <div class="f">
                          <label for="reg-destination">Destino</label>
                          <app-combobox inputId="reg-destination" testId="reg-destination" placeholder="Municipio" emptyText="No hay municipios con ese nombre" [required]="true" [disabled]="busy()" [text]="facade.destinationText()" [options]="placeOptions('destination')" [loading]="facade.places.loading()" [invalid]="!!err('destination')" [describedBy]="err('destination') ? 'reg-destination-err' : null" (typed)="facade.typePlace('destination', $event)" (opened)="facade.openPlaces('destination')" (picked)="facade.pickPlace('destination', $event)" />
                          @if (err('destination'); as e) { <small class="bad" id="reg-destination-err" data-testid="reg-error-destination">{{ e }}</small> }
                        </div>
                      </div>
                      <div class="f" data-testid="reg-distance-block">
                        @switch (facade.route().state) {
                          @case ('loading') { <span class="dist" role="status" data-testid="reg-route-loading">Calculando distancia…</span> }
                          @case ('ready') {
                            @if (!facade.distanceEditing()) {
                              <span class="dist" data-testid="reg-route-ready"><b>{{ routeLabel() }}</b><button type="button" class="link" data-testid="reg-distance-edit" [disabled]="busy()" (click)="facade.editDistance(true)">Escribir otra</button></span>
                            } @else {
                              <span class="dist"><button type="button" class="link" data-testid="reg-distance-route" (click)="facade.editDistance(false)">Usar la distancia por ruta ({{ routeKm() }} km)</button></span>
                            }
                          }
                          @case ('unavailable') { <small data-testid="reg-route-unavailable">{{ routeHint() }}</small> }
                          @default { <small data-testid="reg-route-idle">La distancia por ruta se calcula al elegir origen y destino.</small> }
                        }
                        @if (facade.distanceVisible()) {
                          <label for="reg-distance">Distancia (km)</label>
                          <input id="reg-distance" class="input" type="text" inputmode="decimal" autocomplete="off" [value]="facade.distance()" [disabled]="busy()" [attr.aria-invalid]="err('distance') ? 'true' : null" [attr.aria-describedby]="err('distance') ? 'reg-distance-err' : null" data-testid="reg-distance" (input)="facade.setDistance(read($event))" />
                          @if (err('distance'); as e) { <small class="bad" id="reg-distance-err" data-testid="reg-error-distance">{{ e }}</small> }
                        }
                      </div>
                    </section>

                    <section class="col" aria-labelledby="reg-energy-h">
                      <h3 id="reg-energy-h">Energía</h3>
                      <fieldset class="seg" data-testid="reg-mode">
                        <legend>Cómo registras la energía</legend>
                        <label [class.on]="facade.mode() === 'REAL'"><input type="radio" name="reg-mode" value="REAL" [checked]="facade.mode() === 'REAL'" [disabled]="busy()" data-testid="reg-mode-real" (change)="facade.setMode('REAL')" />Consumo real</label>
                        <label [class.on]="facade.mode() === 'ESTIMATED'"><input type="radio" name="reg-mode" value="ESTIMATED" [checked]="facade.mode() === 'ESTIMATED'" [disabled]="busy()" data-testid="reg-mode-estimated" (change)="facade.setMode('ESTIMATED')" />Rendimiento estimado</label>
                      </fieldset>
                      @if (facade.needsFuel()) {
                        <div class="f">
                          <label for="reg-fuel">Combustible del viaje</label>
                          <select id="reg-fuel" class="input" [disabled]="busy()" [attr.aria-invalid]="err('fuel') ? 'true' : null" [attr.aria-describedby]="err('fuel') ? 'reg-fuel-err' : 'reg-fuel-hint'" data-testid="reg-fuel" (change)="facade.setFuel(read($event))">
                            <option value="" [selected]="!facade.fuelChoice()">Elegir</option>
                            @for (f of facade.options.data()?.fuels ?? []; track f.value) { <option [value]="f.value" [selected]="f.value === facade.fuelChoice()">{{ f.label }}</option> }
                          </select>
                          <small id="reg-fuel-hint">El vehículo no tiene combustible registrado.</small>
                          @if (err('fuel'); as e) { <small class="bad" id="reg-fuel-err" data-testid="reg-error-fuel">{{ e }}</small> }
                        </div>
                      }
                      <div class="pairs">
                        <div class="f">
                          <label for="reg-value">{{ facade.mode() === 'REAL' ? 'Consumo' : 'Rendimiento' }}</label>
                          <input id="reg-value" class="input" type="text" inputmode="decimal" autocomplete="off" [value]="valueText()" [disabled]="busy() || !facade.fuel()" [attr.aria-invalid]="err('value') ? 'true' : null" [attr.aria-describedby]="err('value') ? 'reg-value-err' : 'reg-energy-hint'" data-testid="reg-value" (input)="facade.setValue(read($event))" />
                        </div>
                        <div class="f">
                          <label for="reg-unit">Unidad</label>
                          <select id="reg-unit" class="input" [disabled]="busy() || !facade.fuel()" [attr.aria-invalid]="err('unit') ? 'true' : null" [attr.aria-describedby]="err('unit') ? 'reg-unit-err' : null" data-testid="reg-unit" (change)="facade.setUnit(read($event))">
                            <option value="" [selected]="!unitValue()">Elegir</option>
                            @for (u of units(); track u.value) { <option [value]="u.value" [selected]="u.value === unitValue()">{{ u.label }}</option> }
                          </select>
                        </div>
                      </div>
                      @if (err('value'); as e) { <small class="f bad" id="reg-value-err" data-testid="reg-error-value">{{ e }}</small> }
                      @if (err('unit'); as e) { <small class="f bad" id="reg-unit-err" data-testid="reg-error-unit">{{ e }}</small> }
                      @if (vehicleEfficiency(); as own) { <button type="button" class="link" data-testid="reg-vehicle-efficiency" [disabled]="busy()" (click)="facade.useVehicleEfficiency()">{{ own }}</button> }
                      @if (lastEfficiency(); as last) { <button type="button" class="link" data-testid="reg-last-efficiency" [disabled]="busy()" (click)="facade.useLastEfficiency()">{{ last }}</button> }
                      <small class="f" id="reg-energy-hint" data-testid="reg-energy-hint">{{ facade.fuel() ? (facade.vehicle()?.vehicleEfficiency ? 'Si lo dejas vacío, se usa el rendimiento del vehículo si es compatible.' : 'Si lo dejas vacío, el viaje queda por completar.') : 'Elige primero el vehículo.' }}</small>
                      @if (facade.fuel(); as fuel) { @if (!fuel.hasFactor) { <p class="warn" role="note" data-testid="reg-no-factor">Sin factor de emisión verificado: el viaje quedará sin calcular.</p> } }
                      <div class="f">
                        <label for="reg-cargo">Carga (t), opcional</label>
                        <input id="reg-cargo" class="input" type="text" inputmode="decimal" autocomplete="off" [value]="facade.cargo()" [disabled]="busy()" [attr.aria-invalid]="err('cargo') ? 'true' : null" [attr.aria-describedby]="err('cargo') ? 'reg-cargo-err' : null" data-testid="reg-cargo" (input)="facade.setCargo(read($event))" />
                        @if (err('cargo'); as e) { <small class="bad" id="reg-cargo-err" data-testid="reg-error-cargo">{{ e }}</small> }
                      </div>
                    </section>
                  </div>
                  @if (facade.error(); as e) { <p class="alert alert-danger" role="alert" data-testid="reg-error">{{ errorText(e) }}</p> }
                </div>
                <div class="ft">
                  @if (confirmDiscard()) {
                    <span class="ask" role="alertdialog" aria-label="Descartar lo escrito" data-testid="reg-discard-ask">¿Descartar lo que escribiste?</span>
                    <button type="button" class="btn btn-ghost" #keep data-testid="reg-keep" (click)="confirmDiscard.set(false)">Seguir editando</button>
                    <button type="button" class="btn btn-danger" data-testid="reg-discard" (click)="closed.emit()">Descartar</button>
                  } @else {
                    <button type="button" class="btn btn-ghost" data-testid="reg-cancel" [disabled]="facade.saving()" (click)="requestClose()">Cancelar</button>
                    <button type="button" class="btn btn-secondary" data-testid="reg-save-another" [disabled]="busy()" (click)="facade.save(true)">Guardar y registrar otro</button>
                    <button type="submit" class="btn btn-primary" data-testid="reg-save" [disabled]="busy()" [attr.aria-busy]="facade.saving()">@if (facade.saving()) { <span class="spin" aria-hidden="true"></span>Guardando… } @else { Guardar }</button>
                  }
                </div>
              </form>
            }
            @default {
              <div class="bd skel" data-testid="reg-loading"><i style="width: 60%"></i><i style="width: 90%"></i><i style="width: 75%"></i><i style="width: 85%"></i></div>
              <span class="sr-only" role="status">Cargando el formulario…</span>
            }
          }
        }
      }
      <span class="sr-only" role="status" aria-live="polite" aria-atomic="true" data-testid="reg-live">{{ facade.announcement() }}</span>
    </dialog>
  `,
})
export class TripRegistrationComponent {
  protected readonly facade = inject(TripRegistrationFacade);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly title = viewChild<ElementRef<HTMLElement>>('title');
  private readonly stepTitle = viewChild<ElementRef<HTMLElement>>('stepTitle');
  private readonly keep = viewChild<ElementRef<HTMLElement>>('keep');
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** Se cerró el diálogo (la pantalla descarta el estado y devuelve el foco). */
  readonly closed = output<void>();
  /** Abrir el detalle de un viaje (el recién guardado o uno ya registrado). */
  readonly detail = output<string>();
  readonly review = output<string>();
  readonly complete = output<string>();

  protected readonly swapIcon = SWAP_ICON;
  protected readonly confirmDiscard = signal(false);
  protected readonly day = dayText;
  protected readonly path = routeText;
  protected readonly kg = kgText;
  protected readonly headline = resultHeadline;
  protected readonly errorText = registrationErrorText;
  protected readonly busy = computed(() => this.facade.saving() || this.facade.prefilling());
  protected readonly vehicleOptions = computed<readonly ComboOption[]>(() =>
    this.facade.vehicles.results().map((v) => ({ key: v.plate, label: v.plate, detail: [v.configuration, v.fuelLabel].filter((x): x is string => !!x).join(' · ') || null, tag: v.active ? null : 'Inactivo' })),
  );
  protected readonly units = computed(() => (this.facade.mode() === 'REAL' ? this.facade.consumptionUnits() : this.facade.efficiencyUnits()));
  protected readonly unitValue = computed(() => (this.facade.mode() === 'REAL' ? this.facade.consumptionUnit() : this.facade.efficiencyUnit()));
  protected readonly valueText = computed(() => (this.facade.mode() === 'REAL' ? this.facade.consumption() : this.facade.efficiency()));
  protected readonly vehicleEfficiency = computed(() => {
    const vehicle = this.facade.vehicle();

    return vehicle && this.facade.mode() === 'ESTIMATED' ? vehicleEfficiencyText(vehicle, unitLabel) : null;
  });
  protected readonly lastEfficiency = computed(() => {
    const vehicle = this.facade.vehicle();

    return vehicle && this.facade.mode() === 'ESTIMATED' ? lastEfficiencyText(vehicle, unitLabel) : null;
  });
  protected readonly routeLabel = computed(() => {
    const route = this.facade.route();

    return route.state === 'ready' ? routeLine(route.km) : '';
  });
  protected readonly routeKm = computed(() => {
    const route = this.facade.route();

    return route.state === 'ready' ? distanceText(route.km) : '';
  });
  protected readonly routeHint = computed(() => {
    const route = this.facade.route();

    if (route.state !== 'unavailable') return '';

    return route.reason === 'SAME_PLACE' ? 'El origen y el destino son el mismo lugar: escribe la distancia, o déjala vacía y el viaje queda por completar.' : 'No hay una distancia por ruta: escríbela, o déjala vacía y el viaje queda por completar.';
  });

  constructor() {
    afterNextRender(() => {
      const element = this.dialog().nativeElement;

      if (!element.open) element.showModal();

      // Clic en el fondo oscurecido: como Escape (el formulario no se pierde por un clic accidental si tiene algo escrito).
      element.addEventListener('click', (event) => this.onBackdrop(event));
      element.addEventListener('keydown', (event) => this.onAlternate(event));
    });

    // El foco sigue al paso: primer campo del formulario cuando está listo (y tras «Guardar y registrar otro»); título del paso en el aviso de repetido y en el resultado.
    effect(() => {
      const step = this.facade.step();
      const ready = this.facade.options.status() === 'ready' && !this.facade.prefilling();

      this.facade.lastSaved();
      untracked(() => setTimeout(() => this.focusStep(step, ready)));
    });

    // Tras un guardado con errores, el foco va al primer campo marcado.
    effect(() => {
      const errors = this.facade.fieldErrors();

      if (Object.keys(errors).length > 0) untracked(() => setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()));
    });

    // La confirmación de descartar pone el foco en «Seguir editando».
    effect(() => {
      if (this.confirmDiscard()) untracked(() => setTimeout(() => this.keep()?.nativeElement.focus()));
    });
  }

  protected err(field: string): string | null {
    return this.facade.fieldErrors()[field] ?? null;
  }

  protected placeOptions(kind: 'origin' | 'destination'): readonly ComboOption[] {
    return this.facade.placeField() === kind ? this.facade.places.results().map((p) => ({ key: p.code, label: p.label })) : [];
  }

  protected read(event: Event): string {
    return (event.target as HTMLInputElement | HTMLSelectElement).value;
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.facade.save(false);
  }

  /** `Alt+Enter`: guardar y registrar otro. */
  private onAlternate(event: KeyboardEvent): void {
    if (!event.altKey || event.key !== 'Enter' || this.facade.step() !== 'form') return;

    event.preventDefault();
    this.facade.save(true);
  }

  /** Escape: cierra; con algo escrito pide confirmar; con la confirmación abierta vuelve a editar; nunca interrumpe un guardado. */
  protected onCancel(event: Event): void {
    event.preventDefault();

    if (this.confirmDiscard()) return this.confirmDiscard.set(false);

    this.requestClose();
  }

  private onBackdrop(event: MouseEvent): void {
    const element = this.dialog().nativeElement;

    if (event.target !== element) return;

    const box = element.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;

    if (outside && !(event.clientX === 0 && event.clientY === 0)) this.requestClose();
  }

  protected requestClose(): void {
    if (this.facade.saving()) return;

    if (this.facade.dirty()) this.confirmDiscard.set(true);
    else this.closed.emit();
  }

  private focusStep(step: string, ready: boolean): void {
    const root = this.host.nativeElement;

    if (step === 'form') {
      const target = ready ? root.querySelector<HTMLElement>('#reg-date') : this.title()?.nativeElement;

      target?.focus();
    } else {
      this.stepTitle()?.nativeElement.focus();
    }
  }
}
