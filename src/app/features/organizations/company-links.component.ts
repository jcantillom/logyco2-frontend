import { DatePipe, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { Observable } from 'rxjs';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ToastService } from '../../core/notifications/toast.service';
import { reloadOnContextChange } from '../../core/org/organization-context';
import {
  CounterpartType,
  ExternalCounterpart,
  Link,
  LinkCandidate,
  LINK_TYPES,
  LinkStatus,
  LinkType,
  OurRole,
} from '../../domain/models/links';
import { hueOf, initialsOf } from '../../shared/ui/avatar';
import { CloseOnBackdropDirective } from '../../shared/ui/close-on-backdrop.directive';
import { PaginationComponent } from '../../shared/ui/pagination.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { LinksFacade } from './links.facade';

type Sub = 'linked' | 'requests' | 'external';
type Mode = 'registered' | 'external';

export const TYPE_LABELS: Readonly<Record<string, string>> = {
  TRANSPORT_SERVICE: 'Servicio de transporte',
  SUBCONTRACTING: 'Subcontratación',
  OTHER_LOGISTICS: 'Otra relación logística',
};
export const STATUS_LABELS: Readonly<Record<LinkStatus, { text: string; tone: 'success' | 'warning' | 'neutral' | 'danger' }>> = {
  PENDING: { text: 'Pendiente', tone: 'warning' },
  ACTIVE: { text: 'Vigente', tone: 'success' },
  REJECTED: { text: 'Rechazada', tone: 'danger' },
  CANCELLED: { text: 'Cancelada', tone: 'neutral' },
  ENDED: { text: 'Finalizada', tone: 'neutral' },
};
const EVENT_LABELS: Readonly<Record<string, string>> = {
  REQUESTED: 'Solicitud enviada',
  ACCEPTED: 'Solicitud aceptada',
  REJECTED: 'Solicitud rechazada',
  CANCELLED: 'Solicitud cancelada',
  ENDED: 'Vínculo finalizado',
};
const COUNTERPART_LABELS: Readonly<Record<CounterpartType, string>> = { SHIPPER: 'Generador de carga', CARRIER: 'Transportador', BOTH: 'Generador y transportador' };
const COUNTRIES: readonly { code: string; name: string }[] = [
  { code: 'CO', name: 'Colombia' }, { code: 'EC', name: 'Ecuador' }, { code: 'PE', name: 'Perú' }, { code: 'VE', name: 'Venezuela' },
  { code: 'PA', name: 'Panamá' }, { code: 'BR', name: 'Brasil' }, { code: 'MX', name: 'México' }, { code: 'US', name: 'Estados Unidos' }, { code: 'ES', name: 'España' },
];

/** Qué es NUESTRA empresa en el vínculo, dicho con palabras del negocio. */
export function roleText(type: string, role: OurRole): string {
  if (type === 'SUBCONTRACTING') return role === 'PROVIDER' ? 'Somos subcontratistas' : 'Subcontratamos';

  const what = type === 'TRANSPORT_SERVICE' ? 'el transporte' : 'el servicio';

  return role === 'PROVIDER' ? `Prestamos ${what}` : `Contratamos ${what}`;
}

/** Pestaña «Empresas vinculadas»: vínculos con empresas registradas (con aceptación de la otra) y contrapartes externas. */
@Component({
  selector: 'app-company-links',
  imports: [CloseOnBackdropDirective, DatePipe, NgTemplateOutlet, ReactiveFormsModule, PaginationComponent, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      .lh { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 14px; }
      .lh h2 { margin: 0; font-size: 1.15rem; color: var(--c-head); } .lh p { margin: 2px 0 0; color: var(--c-mu); font-size: 0.86rem; }
      .tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 16px; }
      .tile { all: unset; box-sizing: border-box; cursor: pointer; display: flex; flex-direction: column; gap: 2px; padding: 12px 14px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-sf); }
      .tile:hover { border-color: var(--c-primary); } .tile:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .tile b { font-size: 1.5rem; color: var(--c-head); line-height: 1.1; } .tile span { color: var(--c-mu); font-size: 0.8rem; }
      .tile.warn { border-color: var(--c-warning); background: var(--c-warn-soft); }
      .subtabs { display: flex; gap: 6px; border-bottom: 1px solid var(--c-bd); margin-bottom: 14px; flex-wrap: wrap; }
      .sub { all: unset; box-sizing: border-box; cursor: pointer; padding: 9px 12px; font-weight: 600; font-size: 0.9rem; color: var(--c-text2); border-bottom: 3px solid transparent; margin-bottom: -1px; display: inline-flex; gap: 8px; align-items: center; }
      .sub[aria-selected='true'] { color: var(--c-accent); border-bottom-color: var(--c-primary); } .sub:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; border-radius: 6px; }
      .sub i { font-style: normal; background: var(--c-bad-soft); color: var(--c-danger); border-radius: 999px; padding: 0 7px; font-size: 0.74rem; font-weight: 800; }
      .bar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
      .bar .input { max-width: 300px; min-height: 40px; }
      .seg { display: inline-flex; border: 1px solid var(--c-bd); border-radius: 10px; overflow: hidden; }
      .seg button { all: unset; cursor: pointer; padding: 7px 14px; font-size: 0.86rem; font-weight: 600; color: var(--c-text2); background: var(--c-sf); }
      .seg button[aria-pressed='true'] { background: var(--c-ok-soft); color: var(--c-accent); } .seg button:focus-visible { outline: 3px solid var(--c-focus); outline-offset: -3px; }
      .tw { overflow-x: auto; }
      .tbl { width: 100%; border-collapse: collapse; font-size: 0.88rem; }
      .tbl th {
        text-align: left; padding: 12px; font-size: 0.72rem; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; color: var(--c-text2);
        background: linear-gradient(180deg, color-mix(in srgb, var(--c-primary) 9%, var(--c-s2)), color-mix(in srgb, var(--c-primary) 4%, var(--c-s2)));
        border-top: 1px solid var(--c-bd); border-bottom: 2px solid color-mix(in srgb, var(--c-primary) 35%, var(--c-bd));
      }
      .tbl th:first-child { border-left: 1px solid var(--c-bd); }
      .tbl th:last-child { border-right: 1px solid var(--c-bd); }
      .tbl th, .tbl td { overflow-wrap: anywhere; }
      .tbl .nw { white-space: nowrap; overflow-wrap: normal; }
      /* El texto de las etiquetas (estado, tipo) se alinea con el de su encabezado: la píldora sobresale su propio relleno. */
      .tbl td > .badge, .tbl td > .chips { margin-left: -10px; }
      .tbl th:last-child, .tbl td:last-child, .tbl .c { text-align: center; }
      .tbl td.c > .badge { margin-left: 0; }
      .tbl th:first-child { border-radius: 10px 0 0 10px; } .tbl th:last-child { border-radius: 0 10px 10px 0; }
      .tbl td { padding: 11px 12px; border-bottom: 1px solid var(--c-bd); vertical-align: middle; }
      .tbl tbody tr:last-child td { border-bottom: 0; }
      .nm { display: flex; flex-direction: column; min-width: 0; } .nm strong { color: var(--c-head); } .nm span { color: var(--c-mu); font-size: 0.78rem; }
      .chips { display: flex; flex-wrap: wrap; gap: 4px; }
      .acts { display: flex; gap: 6px; flex-wrap: nowrap; justify-content: center; }
      .empty { padding: 18px 14px; text-align: center; color: var(--c-mu); border: 1px dashed var(--c-bd); border-radius: 12px; font-size: 0.88rem; }
      .empty strong { display: block; color: var(--c-head); margin-bottom: 2px; }
      .cards { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .mode { all: unset; box-sizing: border-box; cursor: pointer; padding: 14px; border: 1px solid var(--c-bd); border-radius: 12px; display: flex; flex-direction: column; gap: 4px; background: var(--c-sf); }
      .mode:hover { border-color: var(--c-primary); } .mode:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; } .mode strong { color: var(--c-head); } .mode span { color: var(--c-mu); font-size: 0.84rem; }
      .hits { list-style: none; margin: 8px 0 0; padding: 0; display: flex; flex-direction: column; gap: 6px; max-height: 210px; overflow-y: auto; }
      .hit { all: unset; box-sizing: border-box; width: 100%; cursor: pointer; padding: 9px 12px; border: 1px solid var(--c-bd); border-radius: 10px; display: flex; align-items: center; gap: 10px; background: var(--c-sf); }
      .hit:hover:not([disabled]) { border-color: var(--c-primary); } .hit[aria-checked='true'] { border-color: var(--c-primary); box-shadow: 0 0 0 1px var(--c-primary); background: var(--c-s2); }
      .hit[disabled] { opacity: 0.6; cursor: not-allowed; } .hit:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .roles { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
      .role { display: flex; gap: 8px; align-items: flex-start; padding: 10px; border: 1px solid var(--c-bd); border-radius: 10px; cursor: pointer; font-size: 0.88rem; }
      .role:has(input:checked) { border-color: var(--c-primary); background: var(--c-s2); } .role small { display: block; color: var(--c-mu); }
      .notice { padding: 10px 12px; border-radius: 10px; background: var(--c-warn-soft); border: 1px solid var(--c-warning); font-size: 0.86rem; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: space-between; }
      .pick { padding: 10px 12px; border: 1px solid var(--c-primary); border-radius: 10px; background: var(--c-s2); display: flex; justify-content: space-between; gap: 8px; align-items: center; }
      .timeline { list-style: none; margin: 8px 0 0; padding: 0 0 0 14px; border-left: 2px solid var(--c-bd); display: flex; flex-direction: column; gap: 10px; }
      .timeline li { position: relative; } .timeline li::before { content: ''; position: absolute; left: -20px; top: 5px; width: 10px; height: 10px; border-radius: 50%; background: var(--c-primary); }
      .timeline small { color: var(--c-mu); display: block; }
      dialog.drawer { margin: 0 0 0 auto; height: 100dvh; max-height: 100dvh; width: min(500px, 100vw); border: 0; border-radius: 18px 0 0 18px; padding: 0; background: var(--c-bg); color: var(--c-text); box-shadow: -24px 0 60px rgb(81 83 74 / 28%); overflow: hidden; }
      dialog.drawer[open] { display: flex; flex-direction: column; }
      @media (prefers-reduced-motion: no-preference) { dialog.drawer[open] { animation: drawer-in 0.22s ease-out; } }
      @keyframes drawer-in { from { transform: translateX(28px); opacity: 0; } to { transform: none; opacity: 1; } }
      dialog.drawer::backdrop { background: rgb(81 83 74 / 45%); backdrop-filter: blur(2px); }
      .dr-head { display: flex; align-items: center; gap: 14px; padding: 20px 22px; background: radial-gradient(120% 140% at 0 0, var(--c-ok-soft), var(--c-sf) 70%); border-bottom: 1px solid var(--c-bd); flex: none; }
      .dr-av { width: 52px; height: 52px; flex: none; display: grid; place-items: center; border-radius: 14px; font-weight: 800; font-size: 1.05rem; color: var(--c-accent); background: var(--c-sf); border: 1px solid hsl(var(--h, 160) 35% 80%); box-shadow: 0 4px 10px color-mix(in srgb, var(--c-gray) 7%, transparent); }
      .dr-id { min-width: 0; flex: 1; display: flex; flex-direction: column; gap: 4px; align-items: flex-start; }
      .dr-id h2 { margin: 0; font-size: 1.15rem; color: var(--c-head); letter-spacing: -0.02em; overflow-wrap: anywhere; } .dr-id p { margin: 0; color: var(--c-mu); font-size: 0.82rem; }
      .dr-x { all: unset; box-sizing: border-box; width: 34px; height: 34px; border-radius: 10px; display: grid; place-items: center; cursor: pointer; color: var(--c-mu); flex: none; }
      .dr-x:hover { background: var(--c-s3); color: var(--c-head); } .dr-x:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; } .dr-x svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; }
      .dr-body { padding: 16px 22px 22px; display: flex; flex-direction: column; gap: 14px; overflow-y: auto; flex: 1 1 auto; min-height: 0; }
      .dr-card { background: var(--c-sf); border: 1px solid var(--c-bd); border-radius: 14px; padding: 14px 16px; }
      .dr-card h3 { margin: 0 0 10px; font-size: 0.7rem; letter-spacing: 0.1em; text-transform: uppercase; color: var(--c-accent); font-weight: 800; }
      .facts2 { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 9px 16px; margin: 0; font-size: 0.88rem; } .facts2 dt { color: var(--c-mu); font-weight: 600; } .facts2 dd { margin: 0; overflow-wrap: anywhere; color: var(--c-head); }
      .quote { margin: 0; padding: 10px 12px; border-left: 3px solid var(--c-primary); background: var(--c-s2); border-radius: 0 10px 10px 0; color: var(--c-text2); font-size: 0.88rem; } .quote small { display: block; color: var(--c-mu); font-weight: 600; margin-bottom: 2px; }
      .timeline { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0; }
      .timeline li { position: relative; padding: 0 0 14px 28px; } .timeline li:last-child { padding-bottom: 0; }
      .timeline li::before { content: ''; position: absolute; left: 8px; top: 20px; bottom: 0; width: 2px; background: var(--c-bd); } .timeline li:last-child::before { display: none; }
      .timeline .dot { position: absolute; left: 0; top: 1px; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center; background: var(--c-ok-soft); color: var(--c-accent); }
      .timeline .dot.bad { background: var(--c-bad-soft); color: var(--c-danger); } .timeline .dot.off { background: var(--c-s3); color: var(--c-mu); }
      .timeline .dot svg { width: 11px; height: 11px; fill: none; stroke: currentColor; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      .timeline strong { color: var(--c-head); font-size: 0.9rem; } .timeline small { color: var(--c-mu); display: block; font-size: 0.78rem; }
      .dr-foot { padding: 14px 22px; border-top: 1px solid var(--c-bd); background: var(--c-sf); display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; flex: none; }
      @media (max-width: 800px) { .tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } .cards, .roles { grid-template-columns: 1fr; } }
    `,
  ],
  template: `
    <section aria-labelledby="links-h">
      <div class="lh">
        <div>
          <h2 id="links-h">Empresas vinculadas</h2>
          <p>Gestiona las empresas con las que compartes operaciones logísticas o servicios de transporte.</p>
        </div>
        @if (canManage()) { <button type="button" class="btn btn-primary" data-testid="link-new" (click)="openRequest()">+ Vincular empresa</button> }
      </div>

      <app-resource-state [status]="facade.summary.status()" [error]="facade.summary.error()" (retry)="facade.loadSummary()">
        @if (facade.summary.data(); as s) {
          <div class="tiles" data-testid="link-tiles">
            <button type="button" class="tile" (click)="go('linked')"><b>{{ s.active }}</b><span>Empresas vinculadas activas</span></button>
            <button type="button" class="tile" [class.warn]="s.pendingReceived > 0" (click)="go('requests', 'received')"><b>{{ s.pendingReceived }}</b><span>Solicitudes recibidas pendientes</span></button>
            <button type="button" class="tile" (click)="go('requests', 'sent')"><b>{{ s.pendingSent }}</b><span>Solicitudes enviadas pendientes</span></button>
            <button type="button" class="tile" (click)="go('external')"><b>{{ s.external }}</b><span>Contrapartes externas</span></button>
          </div>
        }
      </app-resource-state>

      <div class="subtabs" role="tablist" aria-label="Empresas vinculadas">
        <button type="button" class="sub" role="tab" data-testid="sub-linked" [attr.aria-selected]="sub() === 'linked'" (click)="go('linked')">Vinculadas</button>
        <button type="button" class="sub" role="tab" data-testid="sub-requests" [attr.aria-selected]="sub() === 'requests'" (click)="go('requests')">Solicitudes @if ((facade.summary.data()?.pendingReceived ?? 0) > 0) { <i>{{ facade.summary.data()?.pendingReceived }}</i> }</button>
        <button type="button" class="sub" role="tab" data-testid="sub-external" [attr.aria-selected]="sub() === 'external'" (click)="go('external')">Contrapartes externas</button>
      </div>

      @switch (sub()) {
        @case ('linked') {
          <div class="bar"><input class="input" type="search" placeholder="Buscar empresa vinculada" aria-label="Buscar empresa vinculada" data-testid="link-search" [value]="facade.search()" (input)="onSearch($event)" /></div>
          <ng-container [ngTemplateOutlet]="linksTable" />
        }
        @case ('requests') {
          <div class="bar">
            <div class="seg" role="group" aria-label="Tipo de solicitudes">
              @for (v of requestViews; track v.id) { <button type="button" [attr.aria-pressed]="facade.view() === v.id" [attr.data-testid]="'view-' + v.id" (click)="facade.loadList({ view: v.id })">{{ v.label }}</button> }
            </div>
          </div>
          <ng-container [ngTemplateOutlet]="linksTable" />
        }
        @case ('external') {
          <div class="bar">
            <input class="input" type="search" placeholder="Buscar contraparte" aria-label="Buscar contraparte externa" data-testid="ext-search" [value]="facade.externalSearch()" (input)="onExternalSearch($event)" />
            @if (canManage()) { <button type="button" class="btn btn-secondary btn-sm" data-testid="ext-new" (click)="openRequest('external')">+ Registrar contraparte</button> }
          </div>
          <app-resource-state [status]="facade.external.status()" [error]="facade.external.error()" (retry)="facade.loadExternal()">
            @if (facade.external.data(); as page) {
              @if (page.items.length === 0) {
                <div class="empty" data-testid="ext-empty"><strong>{{ facade.externalSearch() ? 'Sin resultados' : 'Aún no registras contrapartes externas' }}</strong>Son empresas con las que operas pero que todavía no usan LoGyCO₂. No tienen cuenta ni acceso a tus datos.</div>
              } @else {
                <div class="tw">
                  <table class="tbl" data-testid="ext-table">
                    <caption class="sr-only">Contrapartes externas</caption>
                    <colgroup><col style="width: 30%" /><col style="width: 15%" /><col style="width: 17%" /><col style="width: 12%" /><col style="width: 19%" /><col style="width: 1%" /></colgroup>
                    <thead><tr><th scope="col">Empresa</th><th scope="col">Identificación</th><th scope="col">Tipo</th><th scope="col">País</th><th scope="col" class="c">Estado</th><th scope="col" class="nw">Acciones</th></tr></thead>
                    <tbody>
                      @for (x of page.items; track x.id) {
                        <tr>
                          <td><div class="nm"><strong>{{ x.name }}</strong><span>{{ typeText(x.relationshipType) }} · {{ ourRoleText(x.relationshipType, x.ourRole) }}</span></div></td>
                          <td>{{ x.taxId ?? '—' }}</td>
                          <td>{{ counterpartLabel(x.counterpartType) }}</td>
                          <td>{{ countryName(x.country) }}</td>
                          <td class="c"><span class="badge">Externa / No registrada</span></td>
                          <td class="nw"><div class="acts">@if (canManage()) { <button type="button" class="btn btn-secondary btn-sm" (click)="openRequest('external', x)">Editar</button> <button type="button" class="btn btn-danger-soft btn-sm" (click)="removeExternal(x)">Quitar</button> }</div></td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
                <app-pagination [page]="page" (pageChange)="facade.loadExternal({ page: $event })" />
              }
            }
          </app-resource-state>
        }
      }

      <ng-template #linksTable>
        <app-resource-state [status]="facade.list.status()" [error]="facade.list.error()" (retry)="facade.loadList()">
          @if (facade.list.data(); as page) {
            @if (page.items.length === 0) {
              <div class="empty" data-testid="links-empty"><strong>{{ emptyTitle() }}</strong>{{ emptyHint() }}</div>
            } @else {
              <div class="tw">
                <table class="tbl" data-testid="links-table">
                  <caption class="sr-only">Empresas vinculadas</caption>
                  <colgroup><col style="width: 25%" /><col style="width: 19%" /><col style="width: 21%" /><col style="width: 15%" /><col style="width: 10%" /><col style="width: 1%" /></colgroup>
                  <thead><tr><th scope="col">Empresa</th><th scope="col">Tipo de empresa</th><th scope="col">Nuestra relación</th><th scope="col" class="c">Estado</th><th scope="col" class="nw">{{ sub() === 'linked' ? 'Vinculada' : 'Fecha' }}</th><th scope="col" class="nw">Acciones</th></tr></thead>
                  <tbody>
                    @for (l of page.items; track l.id) {
                      <tr>
                        <td><div class="nm"><strong>{{ l.counterpart.name }}</strong><span>{{ l.counterpart.taxId ?? l.counterpart.legalName ?? '' }}</span></div></td>
                        <td><span class="chips">@for (t of l.counterpart.types; track t.code) { <span class="badge">{{ t.name }}</span> } @empty { — }</span></td>
                        <td><div class="nm"><strong>{{ typeText(l.relationshipType) }}</strong><span>{{ ourRoleText(l.relationshipType, l.ourRole) }}</span></div></td>
                        <td class="c"><span class="badge" [class.badge-success]="tone(l) === 'success'" [class.badge-warning]="tone(l) === 'warning'" [class.badge-danger]="tone(l) === 'danger'">{{ statusText(l) }}</span></td>
                        <td class="nw">{{ (sub() === 'linked' ? (l.startDate ?? l.createdAt) : l.createdAt) | date: 'd MMM y' }}</td>
                        <td class="nw">
                          <div class="acts">
                            @if (canManage() && l.canAccept) { <button type="button" class="btn btn-primary btn-sm" [disabled]="busy()" (click)="act(l, 'accept')">Aceptar</button> }
                            @if (canManage() && l.canReject) { <button type="button" class="btn btn-danger-soft btn-sm" [disabled]="busy()" (click)="act(l, 'reject')">Rechazar</button> }
                            @if (canManage() && l.canCancel) { <button type="button" class="btn btn-danger-soft btn-sm" [disabled]="busy()" (click)="act(l, 'cancel')">Cancelar</button> }
                            @if (canManage() && l.canEnd && sub() === 'linked') { <button type="button" class="btn btn-danger-soft btn-sm" [disabled]="busy()" (click)="act(l, 'end')">Finalizar</button> }
                            <button type="button" class="btn btn-secondary btn-sm" (click)="openDetail(l.id)">Ver detalle</button>
                          </div>
                        </td>
                      </tr>
                    }
                  </tbody>
                </table>
              </div>
              <app-pagination [page]="page" (pageChange)="facade.loadList({ page: $event })" />
            }
          }
        </app-resource-state>
      </ng-template>
    </section>

    <dialog #detailDialog class="drawer" appCloseOnBackdrop aria-labelledby="det-title">
      @if (facade.detail.data(); as d) {
        <div class="dr-head">
          <span class="dr-av" aria-hidden="true" [style.--h]="hue(d.counterpart.name)">{{ initials(d.counterpart.name) }}</span>
          <div class="dr-id">
            <h2 id="det-title">{{ d.counterpart.name }}</h2>
            @if (d.counterpart.legalName && d.counterpart.legalName !== d.counterpart.name) { <p>{{ d.counterpart.legalName }}</p> }
            <span class="badge" [class.badge-success]="tone(d) === 'success'" [class.badge-warning]="tone(d) === 'warning'" [class.badge-danger]="tone(d) === 'danger'">{{ statusText(d) }}</span>
          </div>
          <button type="button" class="dr-x" aria-label="Cerrar detalle" (click)="closeDetail()"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
        </div>
        <div class="dr-body" data-testid="link-detail">
          <section class="dr-card" aria-label="Empresa">
            <h3>Empresa</h3>
            <dl class="facts2">
              <dt>Identificación</dt><dd>{{ d.counterpart.taxId ?? 'No registrada' }}</dd>
              <dt>Tipo de empresa</dt><dd><span class="chips">@for (t of d.counterpart.types; track t.code) { <span class="badge">{{ t.name }}</span> } @empty { — }</span></dd>
            </dl>
          </section>
          <section class="dr-card" aria-label="Relación">
            <h3>Relación</h3>
            <dl class="facts2">
              <dt>Tipo</dt><dd>{{ typeText(d.relationshipType) }}</dd>
              <dt>Nuestra relación</dt><dd>{{ ourRoleText(d.relationshipType, d.ourRole) }}</dd>
              <dt>Iniciada por</dt><dd>{{ d.requestedByOrganization ?? '—' }}</dd>
              <dt>Solicitada</dt><dd>{{ d.createdAt | date: "d MMM y, h:mm a" }}</dd>
              @if (d.respondedAt) { <dt>Respondida</dt><dd>{{ d.respondedAt | date: "d MMM y, h:mm a" }}</dd> }
              @if (d.endedAt) { <dt>Finalizada</dt><dd>{{ d.endedAt | date: "d MMM y, h:mm a" }}</dd> }
            </dl>
            @if (d.requestNote || d.responseNote || d.endReason) {
              <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 12px">
                @if (d.requestNote) { <p class="quote"><small>Observación</small>{{ d.requestNote }}</p> }
                @if (d.responseNote) { <p class="quote"><small>Respuesta</small>{{ d.responseNote }}</p> }
                @if (d.endReason) { <p class="quote"><small>Motivo</small>{{ d.endReason }}</p> }
              </div>
            }
          </section>
          <section class="dr-card" aria-label="Historial">
            <h3>Historial</h3>
            <ol class="timeline" data-testid="link-events">
              @for (e of d.events; track $index) {
                <li>
                  <span class="dot" [class.bad]="e.action === 'REJECTED'" [class.off]="e.action === 'CANCELLED' || e.action === 'ENDED'" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="e.action === 'REJECTED' ? 'M7 7l10 10M17 7L7 17' : e.action === 'CANCELLED' || e.action === 'ENDED' ? 'M6 12h12' : 'M5 12l4 4 10-10'" /></svg></span>
                  <strong>{{ eventText(e.action) }}</strong>
                  <small>{{ e.byOrganization }}@if (e.actorName) { · {{ e.actorName }} } · {{ e.at | date: "d MMM y, h:mm a" }}</small>
                </li>
              }
            </ol>
          </section>
          @if (canManage() && (d.canAccept || d.canReject || d.canCancel || d.canEnd)) {
            <div class="field"><label for="det-note">Motivo (opcional)</label><textarea id="det-note" class="input" rows="2" maxlength="500" placeholder="Se guarda en el historial del vínculo" [value]="note()" (input)="note.set($any($event.target).value)"></textarea></div>
          }
        </div>
        @if (canManage() && (d.canAccept || d.canReject || d.canCancel || d.canEnd)) {
          <div class="dr-foot">
            @if (d.canReject) { <button type="button" class="btn btn-danger-soft" [disabled]="busy()" (click)="act(d, 'reject', note())">Rechazar</button> }
            @if (d.canCancel) { <button type="button" class="btn btn-danger-soft" [disabled]="busy()" (click)="act(d, 'cancel', note())">Cancelar solicitud</button> }
            @if (d.canEnd) { <button type="button" class="btn btn-danger-soft" [disabled]="busy()" (click)="act(d, 'end', note())">Finalizar vínculo</button> }
            @if (d.canAccept) { <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="act(d, 'accept', note())">Aceptar vínculo</button> }
          </div>
        }
      } @else {
        @if (facade.detail.status() !== 'idle') { <div class="dr-body"><app-resource-state [status]="facade.detail.status()" [error]="facade.detail.error()" (retry)="reloadDetail()" /></div> }
      }
    </dialog>

    <dialog #requestDialog class="dialog dialog-pro" aria-labelledby="req-title">
      <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
        <header class="dp-head">
          <span class="dp-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" /></svg></span>
          <div><h2 id="req-title">{{ editing() ? 'Editar contraparte externa' : 'Vincular empresa' }}</h2><p>{{ mode() === null ? '¿La empresa está registrada en LoGyCO₂?' : mode() === 'registered' ? 'Buscar empresa registrada' : 'Contraparte externa (no registrada)' }}</p></div>
        </header>
        <div class="dialog-body">
          @if (mode() === null) {
            <div class="cards" role="group" aria-label="¿La empresa está registrada en LoGyCO₂?">
              <button type="button" class="mode" data-testid="mode-registered" (click)="chooseMode('registered')"><strong>Buscar empresa registrada</strong><span>Envía una solicitud; la otra empresa debe aceptarla. No se comparten datos ni accesos.</span></button>
              <button type="button" class="mode" data-testid="mode-external" (click)="chooseMode('external')"><strong>Registrar contraparte externa</strong><span>Para una empresa que aún no usa LoGyCO₂. No tiene cuenta ni accede a tus datos.</span></button>
            </div>
          } @else if (mode() === 'registered') {
            <fieldset class="dp-group">
              <legend>Empresa</legend>
              @if (picked(); as p) {
                <div class="pick" data-testid="picked"><div class="nm"><strong>{{ p.name }}</strong><span>{{ p.taxId ?? p.legalName ?? '' }}</span></div><button type="button" class="btn btn-secondary btn-sm" (click)="picked.set(null)">Cambiar</button></div>
              } @else {
                <div class="field">
                  <label for="rq-search">Buscar por NIT, razón social o nombre comercial</label>
                  <div class="bar" style="margin: 0"><input id="rq-search" class="input" type="search" autocomplete="off" [value]="query()" (input)="query.set($any($event.target).value)" (keydown.enter)="$event.preventDefault(); runSearch()" /><button type="button" class="btn btn-secondary btn-sm" data-testid="rq-find" [disabled]="query().trim().length < 3" (click)="runSearch()">Buscar</button></div>
                  <span class="hint">Escribe al menos 3 caracteres. Por privacidad solo se muestran datos básicos.</span>
                </div>
                @if (facade.candidates.status() !== 'idle') {
                <app-resource-state [status]="facade.candidates.status()" [error]="facade.candidates.error()" (retry)="runSearch()">
                  @if (facade.candidates.data(); as hits) {
                    @if (hits.length === 0) { <div class="empty" data-testid="rq-none">No encontramos empresas registradas con ese dato. Si aún no usa LoGyCO₂, <a href="#" (click)="$event.preventDefault(); chooseMode('external')">regístrala como contraparte externa</a>.</div> }
                    <ul class="hits" role="listbox" aria-label="Resultados">
                      @for (h of hits; track h.id) {
                        <li><button type="button" class="hit" role="option" [attr.aria-selected]="false" [disabled]="h.relation !== 'NONE'" [attr.data-testid]="'hit-' + h.id" (click)="pick(h)">
                          <span class="nm"><strong>{{ h.name }}</strong><span>{{ h.taxId ?? h.legalName ?? '' }}</span></span>
                          <span class="chips">@for (t of h.types; track t.code) { <span class="badge">{{ t.name }}</span> }</span>
                          @if (h.relation !== 'NONE') { <span class="badge badge-warning" style="margin-left: auto">{{ relationText(h.relation) }}</span> }
                        </button></li>
                      }
                    </ul>
                  }
                </app-resource-state>
                }
              }
            </fieldset>
          }

          @if (mode() !== null) {
            <fieldset class="dp-group">
              <legend>Relación logística</legend>
              @if (mode() === 'external') {
                <div class="field">
                  <label for="ex-name">Nombre o razón social</label>
                  <input id="ex-name" class="input" type="text" formControlName="name" maxlength="200" [attr.aria-invalid]="bad('name')" />
                  @if (bad('name')) { <span class="field-error">El nombre es obligatorio.</span> }
                </div>
                <div class="dp-grid">
                  <div class="field"><label for="ex-tax">NIT o identificación (opcional)</label><input id="ex-tax" class="input" type="text" formControlName="taxId" maxlength="30" [attr.aria-invalid]="bad('taxId')" />@if (bad('taxId')) { <span class="field-error">Solo letras, números, puntos y guiones.</span> }</div>
                  <div class="field"><label for="ex-country">País</label><select id="ex-country" class="input" formControlName="country">@for (c of countries; track c.code) { <option [value]="c.code">{{ c.name }}</option> }</select></div>
                </div>
                <div class="field"><label for="ex-kind">Tipo de contraparte</label><select id="ex-kind" class="input" formControlName="counterpartType"><option value="SHIPPER">Generador de carga</option><option value="CARRIER">Transportador</option><option value="BOTH">Generador y transportador</option></select></div>
              }
              <div class="field"><label for="rq-type">Tipo de relación</label><select id="rq-type" class="input" formControlName="relationshipType">@for (t of linkTypes; track t) { <option [value]="t">{{ typeText(t) }}</option> }</select></div>
              <div class="field">
                <span class="label" id="rq-role">¿Qué es tu empresa en esta relación?</span>
                <div class="roles" role="radiogroup" aria-labelledby="rq-role">
                  <label class="role"><input type="radio" formControlName="ourRole" value="CONTRACTOR" /><span>Contratante<small>Contrata el servicio</small></span></label>
                  <label class="role"><input type="radio" formControlName="ourRole" value="PROVIDER" /><span>Prestador<small>Presta el servicio</small></span></label>
                </div>
              </div>
              <div class="field"><label for="rq-note">Observación (opcional)</label><textarea id="rq-note" class="input" rows="2" maxlength="500" formControlName="note"></textarea><span class="hint">{{ form.controls.note.value.length }}/500</span></div>
            </fieldset>
            @if (conflict(); as c) {
              <div class="notice" role="alert" data-testid="link-conflict"><span>{{ c.message }}</span>@if (c.linkId) { <button type="button" class="btn btn-secondary btn-sm" (click)="viewExisting(c.linkId)">Ver solicitud</button> } @if (c.registered) { <button type="button" class="btn btn-secondary btn-sm" (click)="switchToRegistered()">Buscar y vincular</button> }</div>
            }
          }
        </div>
        <div class="dialog-actions">
          @if (mode() !== null && !editing()) { <button type="button" class="btn btn-secondary" (click)="mode.set(null)">Atrás</button> }
          <button type="button" class="btn btn-secondary" (click)="closeRequest()">Cancelar</button>
          @if (mode() !== null) { <button type="submit" class="btn btn-primary" data-testid="rq-submit" [disabled]="busy()">{{ busy() ? 'Enviando…' : mode() === 'registered' ? 'Enviar solicitud' : editing() ? 'Guardar cambios' : 'Registrar contraparte' }}</button> }
        </div>
      </form>
    </dialog>
  `,
})
export class CompanyLinksComponent {
  protected readonly facade = inject(LinksFacade);
  private readonly access = inject(AccessPolicy);
  private readonly toast = inject(ToastService);
  private readonly confirm = inject(ConfirmService);
  private readonly feedback = inject(ActionFeedbackService);
  private readonly destroyRef = inject(DestroyRef);
  private readonly route = inject(ActivatedRoute);
  private readonly detailDialog = viewChild.required<ElementRef<HTMLDialogElement>>('detailDialog');
  private readonly requestDialog = viewChild.required<ElementRef<HTMLDialogElement>>('requestDialog');

  protected readonly linkTypes = LINK_TYPES;
  protected readonly countries = COUNTRIES;
  protected readonly requestViews: readonly { id: 'received' | 'sent' | 'history'; label: string }[] = [
    { id: 'received', label: 'Recibidas' },
    { id: 'sent', label: 'Enviadas' },
    { id: 'history', label: 'Historial' },
  ];
  protected readonly canManage = computed(() => this.access.can('relationships:manage'));
  protected readonly sub = signal<Sub>('linked');
  protected readonly busy = signal(false);
  protected readonly note = signal('');
  protected readonly mode = signal<Mode | null>(null);
  protected readonly editing = signal<ExternalCounterpart | null>(null);
  protected readonly query = signal('');
  protected readonly picked = signal<LinkCandidate | null>(null);
  protected readonly conflict = signal<{ message: string; linkId: string | null; registered: boolean } | null>(null);
  protected readonly form = inject(FormBuilder).nonNullable.group({
    name: ['', [Validators.maxLength(200)]],
    taxId: ['', [Validators.pattern(/^$|^[0-9A-Za-z.-]{3,30}$/)]],
    counterpartType: ['CARRIER' as CounterpartType],
    country: ['CO'],
    relationshipType: ['TRANSPORT_SERVICE' as LinkType],
    ourRole: ['PROVIDER' as OurRole],
    note: ['', [Validators.maxLength(500)]],
  });

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    const params = this.route.snapshot.queryParamMap;
    const wanted = params.get('sub');
    const view = params.get('view');

    if (wanted === 'solicitudes') this.sub.set('requests');
    else if (wanted === 'externas') this.sub.set('external');

    reloadOnContextChange(() => {
      this.facade.loadSummary();
      this.load(view === 'sent' || view === 'history' ? view : this.sub() === 'requests' ? 'received' : undefined);
    });
    this.destroyRef.onDestroy(() => this.searchTimer && clearTimeout(this.searchTimer));
  }

  // ------------------------------------------------------------------ navegación y listas

  protected go(sub: Sub, view?: 'received' | 'sent' | 'history'): void {
    this.sub.set(sub);
    this.load(view);
  }

  private load(view?: 'received' | 'sent' | 'history'): void {
    if (this.sub() === 'external') {
      this.facade.loadExternal({ search: '', page: 1 });

      return;
    }

    if (this.sub() === 'linked') this.facade.loadList({ view: 'active', search: '' });
    else this.facade.loadList({ view: view ?? (this.facade.view() === 'active' ? 'received' : this.facade.view()) });
  }

  protected onSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.later(() => this.facade.loadList({ search: value }));
  }

  protected onExternalSearch(event: Event): void {
    const value = (event.target as HTMLInputElement).value;

    this.later(() => this.facade.loadExternal({ search: value }));
  }

  private later(action: () => void): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);

    this.searchTimer = setTimeout(action, 300);
  }

  protected emptyTitle(): string {
    if (this.facade.search()) return 'Sin resultados';

    return { active: 'Aún no tienes empresas vinculadas', received: 'No tienes solicitudes recibidas', sent: 'No has enviado solicitudes', history: 'Sin historial todavía' }[this.facade.view()];
  }

  protected emptyHint(): string {
    if (this.facade.search()) return 'Prueba con otro nombre.';

    return this.facade.view() === 'active' ? 'Usa «+ Vincular empresa» para solicitar un vínculo.' : 'Aquí aparecerán cuando existan.';
  }

  // ------------------------------------------------------------------ etiquetas

  protected hue(name: string): number {
    return hueOf(name);
  }

  protected initials(name: string): string {
    return initialsOf(name);
  }

  protected typeText(type: string): string {
    return TYPE_LABELS[type] ?? type;
  }

  protected ourRoleText(type: string, role: OurRole): string {
    return roleText(type, role);
  }

  protected counterpartLabel(type: CounterpartType): string {
    return COUNTERPART_LABELS[type];
  }

  protected countryName(code: string): string {
    return COUNTRIES.find((c) => c.code === code)?.name ?? code;
  }

  protected statusText(link: Link): string {
    return STATUS_LABELS[link.status].text + (link.status === 'PENDING' ? (link.direction === 'SENT' ? ' · enviada' : ' · recibida') : '');
  }

  protected tone(link: Link): 'success' | 'warning' | 'neutral' | 'danger' {
    return STATUS_LABELS[link.status].tone;
  }

  protected eventText(action: string): string {
    return EVENT_LABELS[action] ?? action;
  }

  protected relationText(relation: LinkCandidate['relation']): string {
    return { NONE: '', ACTIVE: 'Ya vinculada', PENDING_SENT: 'Solicitud enviada', PENDING_RECEIVED: 'Te envió una solicitud' }[relation];
  }

  // ------------------------------------------------------------------ detalle y acciones

  protected openDetail(id: string): void {
    this.note.set('');
    this.facade.openDetail(id);

    if (!this.detailDialog().nativeElement.open) this.detailDialog().nativeElement.showModal();
  }

  protected reloadDetail(): void {
    const id = this.facade.detail.data()?.id;

    if (id) this.facade.openDetail(id);
  }

  protected closeDetail(): void {
    this.detailDialog().nativeElement.close();
  }

  protected async act(link: Link, action: 'accept' | 'reject' | 'cancel' | 'end', note = ''): Promise<void> {
    if (this.busy()) return;

    const texts = {
      accept: ['Aceptar vínculo', `¿Aceptar la solicitud de «${link.counterpart.name}»? El vínculo quedará vigente para ambas empresas. No se comparten datos ni accesos.`, 'Aceptar', 'Vínculo aceptado'],
      reject: ['Rechazar solicitud', `¿Rechazar la solicitud de «${link.counterpart.name}»? Quedará en el historial y no se activará.`, 'Rechazar', 'Solicitud rechazada'],
      cancel: ['Cancelar solicitud', `¿Cancelar tu solicitud a «${link.counterpart.name}»?`, 'Cancelar solicitud', 'Solicitud cancelada'],
      end: ['Finalizar vínculo', `¿Finalizar el vínculo con «${link.counterpart.name}»? El historial se conserva.`, 'Finalizar', 'Vínculo finalizado'],
    }[action];

    if (!(await this.confirm.confirm({ title: texts[0], message: texts[1], confirmLabel: texts[2] }))) return;

    this.run(this.facade.respond(link.id, action, note), texts[3]);
  }

  protected viewExisting(linkId: string): void {
    this.closeRequest();
    this.go('requests', 'received');
    this.openDetail(linkId);
  }

  // ------------------------------------------------------------------ solicitud y contrapartes externas

  protected openRequest(initial: Mode | null = null, edit: ExternalCounterpart | null = null): void {
    this.editing.set(edit);
    this.conflict.set(null);
    this.picked.set(null);
    this.query.set('');
    this.facade.clearCandidates();
    this.form.reset({
      name: edit?.name ?? '',
      taxId: edit?.taxId ?? '',
      counterpartType: edit?.counterpartType ?? 'CARRIER',
      country: edit?.country ?? 'CO',
      relationshipType: (edit?.relationshipType as LinkType) ?? 'TRANSPORT_SERVICE',
      ourRole: edit?.ourRole ?? 'PROVIDER',
      note: edit?.note ?? '',
    });
    this.mode.set(edit ? 'external' : initial);
    this.requestDialog().nativeElement.showModal();
  }

  protected closeRequest(): void {
    this.requestDialog().nativeElement.close();
  }

  protected chooseMode(mode: Mode): void {
    this.mode.set(mode);
    this.conflict.set(null);
  }

  protected switchToRegistered(): void {
    this.query.set(this.form.controls.taxId.value);
    this.mode.set('registered');
    this.conflict.set(null);
    this.runSearch();
  }

  protected runSearch(): void {
    if (this.query().trim().length >= 3) this.facade.searchCandidates(this.query());
  }

  protected pick(candidate: LinkCandidate): void {
    this.picked.set(candidate);
    this.conflict.set(null);
  }

  protected bad(name: 'name' | 'taxId'): boolean {
    const control = this.form.controls[name];

    return control.touched && control.invalid;
  }

  protected submit(): void {
    if (this.busy() || this.mode() === null) return;

    this.form.markAllAsTouched();
    this.conflict.set(null);

    const value = this.form.getRawValue();

    if (this.mode() === 'registered') {
      const target = this.picked();

      if (!target || this.form.controls.note.invalid) return;

      this.run(
        this.facade.request({ counterpartOrganizationId: target.id, relationshipType: value.relationshipType, ourRole: value.ourRole, note: value.note }),
        'Solicitud enviada',
        () => this.closeRequest(),
      );

      return;
    }

    if (!value.name.trim() || this.form.controls.taxId.invalid || this.form.controls.note.invalid) {
      this.form.controls.name.setValidators([Validators.required, Validators.maxLength(200)]);
      this.form.controls.name.updateValueAndValidity();

      return;
    }

    const body = { name: value.name.trim(), taxId: value.taxId.trim() || null, counterpartType: value.counterpartType, country: value.country, relationshipType: value.relationshipType, ourRole: value.ourRole, note: value.note.trim() || null };
    const edit = this.editing();

    this.run(edit ? this.facade.updateExternal(edit.id, body) : this.facade.createExternal(body), edit ? 'Contraparte actualizada' : 'Contraparte registrada', () => this.closeRequest());
  }

  protected async removeExternal(item: ExternalCounterpart): Promise<void> {
    if (!(await this.confirm.confirm({ title: 'Quitar contraparte', message: `¿Quitar a «${item.name}» de tus contrapartes externas? Se conserva el registro y puedes volver a agregarla.`, confirmLabel: 'Quitar' }))) return;

    this.run(this.facade.removeExternal(item.id), 'Contraparte quitada');
  }

  /** Una sola vía para ejecutar acciones: sin doble envío, aviso de éxito y errores recuperables (el formulario conserva lo escrito). */
  private run<T>(action: Observable<T>, success: string, done?: () => void): void {
    if (this.busy()) return;

    this.busy.set(true);
    this.feedback.start('Procesando…');
    action.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.busy.set(false);
        this.feedback.finish(success);
        done?.();
      },
      error: (error: unknown) => {
        this.busy.set(false);
        this.feedback.close();
        const app = toAppError(error);

        if (this.requestDialog().nativeElement.open && this.explain(app)) return;

        this.toast.error(app);
      },
    });
  }

  /** Conflictos conocidos del formulario: se explican dentro del diálogo, con la salida natural (ver la solicitud o vincularla). */
  private explain(error: AppError): boolean {
    const known = ['LINK_REQUEST_PENDING', 'LINK_INVERSE_PENDING', 'LINK_ALREADY_ACTIVE', 'COUNTERPART_REGISTERED', 'EXTERNAL_COUNTERPART_DUPLICATE'];

    if (!known.includes(error.code)) return false;

    const linkId = error.code.startsWith('LINK_') ? (error.details.find((d) => d.field === 'link_id')?.message ?? null) : null;

    this.conflict.set({ message: error.message, linkId, registered: error.code === 'COUNTERPART_REGISTERED' });

    return true;
  }
}
