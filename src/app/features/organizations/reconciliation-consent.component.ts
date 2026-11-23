import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { ToastService } from '../../core/notifications/toast.service';
import { reloadOnContextChange } from '../../core/org/organization-context';
import { ConsentChange, ReconciliationLink } from '../../domain/models/reconciliation';
import { PagerComponent } from '../../shared/ui/pager.component';
import { ResourceStateComponent } from '../../shared/ui/resource-state.component';
import { ReconciliationLinksFacade } from './reconciliation-links.facade';

export const CONSENT_PAGE_SIZES: readonly number[] = [5, 10];

/** Qué pasó con la búsqueda que sigue a permitirla, dicho con palabras llanas. */
export function rescanMessage(candidatesCreated: number, completed: boolean): string {
  if (!completed) return 'La búsqueda no alcanzó a terminar. Puedes volver a lanzarla: repetirla es seguro.';

  if (candidatesCreated === 0) return 'Por ahora no encontramos viajes en común con esta empresa.';

  return `Encontramos ${candidatesCreated} ${candidatesCreated === 1 ? 'posible viaje compartido' : 'posibles viajes compartidos'}. Revísalos en Calidad de datos → Operaciones compartidas.`;
}

/**
 * «Conciliación de viajes» dentro de «Empresas vinculadas»: por cada vínculo, qué permite la propia empresa (buscar viajes compartidos y
 * compartir los resultados de sus viajes) y, solo como sí/no, qué permite la otra. Vincularse no comparte nada; cada permiso es revocable y
 * queda auditado. Solo quien administra los vínculos (`relationships:manage`) puede cambiarlos; los vínculos finalizados son de solo lectura.
 */
@Component({
  selector: 'app-reconciliation-consent',
  imports: [DatePipe, PagerComponent, ResourceStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; margin-top: 22px; }
      h3 { margin: 0; font-size: 1.05rem; color: var(--c-head); }
      .intro { margin: 4px 0 12px; color: var(--c-text2); font-size: 0.9rem; line-height: 1.45; max-width: 860px; }
      .never { margin: 0 0 14px; padding: 10px 14px; border-radius: 12px; background: var(--c-info-bg); color: var(--c-info); font-size: 0.88rem; line-height: 1.45; font-weight: 600; }
      .list { display: grid; gap: 12px; margin: 0 0 12px; padding: 0; list-style: none; }
      .link { display: grid; gap: 12px; padding: 14px 16px; border: 1px solid var(--c-bd); border-radius: 14px; background: var(--c-sf); }
      .top { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 12px; }
      .top h4 { margin: 0; font-size: 1rem; color: var(--c-head); overflow-wrap: anywhere; }
      .status { display: inline-flex; align-items: center; gap: 6px; margin-left: auto; font-size: 0.86rem; font-weight: 700; color: var(--c-head); }
      .status i { font-style: normal; display: inline-grid; place-items: center; width: 20px; height: 20px; border-radius: 50%; background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-secondary) 40%, var(--c-sf)); font-size: 0.8rem; }
      .status.off i { background: var(--c-s3); box-shadow: none; }
      .sides { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
      .side { min-width: 0; display: grid; align-content: start; gap: 10px; padding: 10px 12px; border: 1px solid var(--c-bd); border-radius: 12px; background: var(--c-s2); }
      .side h5 { margin: 0; font-size: 0.82rem; font-weight: 800; color: var(--c-accent); }
      .perm { display: grid; gap: 4px; }
      .sw { display: flex; align-items: flex-start; gap: 10px; font-weight: 700; color: var(--c-head); font-size: 0.92rem; cursor: pointer; }
      .sw.off { cursor: not-allowed; color: var(--c-mu); }
      .sw input { width: 20px; height: 20px; flex: none; margin: 1px 0 0; accent-color: var(--c-primary); cursor: inherit; }
      .sw input:focus-visible { outline: 3px solid var(--c-focus); outline-offset: 2px; }
      .help { margin: 0; padding-left: 30px; color: var(--c-text2); font-size: 0.82rem; line-height: 1.4; }
      .reason { margin: 0; padding-left: 30px; color: var(--c-accent); font-size: 0.82rem; font-weight: 600; }
      .theirs { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 0.9rem; color: var(--c-head); }
      .theirs i { font-style: normal; display: inline-grid; place-items: center; width: 20px; height: 20px; flex: none; border-radius: 50%; font-size: 0.8rem; font-weight: 800; background: var(--c-s3); }
      .theirs.yes i { background: color-mix(in srgb, var(--c-secondary) 14%, var(--c-sf)); box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--c-secondary) 40%, var(--c-sf)); }
      .note { margin: 0; color: var(--c-text2); font-size: 0.86rem; line-height: 1.4; }
      .readonly { margin: 0; color: var(--c-text2); font-size: 0.86rem; }
      .empty { padding: 18px 14px; text-align: center; color: var(--c-mu); border: 1px dashed var(--c-bd); border-radius: 12px; font-size: 0.88rem; }
      .empty strong { display: block; color: var(--c-head); margin-bottom: 2px; }
      @media (max-width: 900px) { .sides { grid-template-columns: minmax(0, 1fr); } .status { margin-left: 0; } }
    `,
  ],
  template: `
    <section aria-labelledby="recon-h" data-testid="recon-section">
      <h3 id="recon-h">Conciliación de viajes</h3>
      <p class="intro">Estar vinculadas no comparte ningún dato. Aquí decides, empresa por empresa, qué permites para encontrar los viajes que ambas declararon.</p>
      <p class="never" data-testid="recon-never">Nada se comparte por el solo hecho de estar vinculadas. La otra empresa nunca ve tu archivo de Excel. Puedes revocar un permiso en cualquier momento y el historial se conserva.</p>

      <app-resource-state [status]="facade.links.status()" [error]="facade.links.error()" [empty]="all().length === 0" emptyTitle="Aún no tienes empresas vinculadas vigentes" emptyMessage="Cuando una empresa acepte el vínculo podrás decidir aquí si permites conciliar viajes con ella." (retry)="facade.load()">
        <ul class="list" aria-label="Autorizaciones por empresa vinculada" data-testid="recon-list">
          @for (link of visible(); track link.relationshipId) {
            <li>
              <article class="link" [attr.aria-label]="'Conciliación con ' + link.counterpart.name" data-testid="recon-link">
                <header class="top">
                  <h4>{{ link.counterpart.name }}</h4>
                  <span class="badge" [class.badge-success]="link.status === 'ACTIVE'" [class.badge-neutral]="link.status === 'ENDED'" data-testid="recon-link-status">{{ link.status === 'ACTIVE' ? 'Vínculo vigente' : 'Vínculo finalizado' }}</span>
                  <span class="status" [class.off]="!link.matchingActive" role="status" data-testid="recon-effective"><i aria-hidden="true">{{ link.matchingActive ? '✓' : '–' }}</i>{{ effectiveText(link) }}</span>
                </header>

                <div class="sides">
                  <section class="side" aria-label="Lo que permite tu empresa" data-testid="recon-own">
                    <h5>Tu empresa</h5>
                    @if (link.status === 'ACTIVE') {
                      <div class="perm">
                        <label class="sw" [class.off]="!canManage() || busy(link)">
                          <input type="checkbox" role="switch" data-testid="switch-matching" [checked]="link.myConsent.matchingEnabled" [disabled]="!canManage() || busy(link)" (change)="toggleMatching(link, $event)" />
                          Permitir buscar viajes compartidos con esta empresa
                        </label>
                        <p class="help">Concede que LoGyCO₂ compare tus viajes con los de esta empresa para encontrar posibles coincidencias. Nunca concede que vea tus datos ni tu Excel.</p>
                      </div>
                      <div class="perm">
                        <label class="sw" [class.off]="!canManage() || busy(link) || !link.myConsent.matchingEnabled">
                          <input type="checkbox" role="switch" data-testid="switch-share" [checked]="link.myConsent.shareResults" [disabled]="!canManage() || busy(link) || !link.myConsent.matchingEnabled" [attr.aria-describedby]="link.myConsent.matchingEnabled ? null : 'share-reason-' + link.relationshipId" (change)="toggleShare(link, $event)" />
                          Compartir los resultados de mis viajes para conciliarlos
                        </label>
                        <p class="help">Concede que esta empresa vea fecha, ruta, combustible, consumo, distancia y kg CO₂ de los viajes que coinciden con los suyos (la placa solo en parte). Nunca concede ver el resto de tus viajes.</p>
                        @if (!link.myConsent.matchingEnabled) { <p class="reason" [id]="'share-reason-' + link.relationshipId" data-testid="share-reason">Primero permite buscar viajes compartidos.</p> }
                      </div>
                      @if (!canManage()) { <p class="readonly" data-testid="recon-readonly">Solo el administrador de la empresa puede cambiar estos permisos.</p> }
                    } @else {
                      <p class="theirs" [class.yes]="link.myConsent.matchingEnabled" data-testid="own-matching"><i aria-hidden="true">{{ link.myConsent.matchingEnabled ? '✓' : '–' }}</i>{{ link.myConsent.matchingEnabled ? 'Permitías buscar viajes compartidos' : 'No permitías buscar viajes compartidos' }}</p>
                      <p class="theirs" [class.yes]="link.myConsent.shareResults" data-testid="own-share"><i aria-hidden="true">{{ link.myConsent.shareResults ? '✓' : '–' }}</i>{{ link.myConsent.shareResults ? 'Compartías los resultados de tus viajes' : 'No compartías los resultados de tus viajes' }}</p>
                    }
                    @if (link.myConsent.updatedAt; as at) { <p class="note" data-testid="recon-updated">Último cambio: {{ at | date: "d MMM y, h:mm a" }}</p> }
                  </section>

                  <section class="side" aria-label="Lo que permite la otra empresa" data-testid="recon-other">
                    <h5>{{ link.counterpart.name }}</h5>
                    <p class="theirs" [class.yes]="link.counterpartConsent.matchingEnabled" data-testid="other-matching"><i aria-hidden="true">{{ link.counterpartConsent.matchingEnabled ? '✓' : '–' }}</i>Buscar viajes compartidos: {{ link.counterpartConsent.matchingEnabled ? 'La otra empresa ya lo permitió' : 'Aún no lo permite' }}</p>
                    <p class="theirs" [class.yes]="link.counterpartConsent.shareResults" data-testid="other-share"><i aria-hidden="true">{{ link.counterpartConsent.shareResults ? '✓' : '–' }}</i>Compartir resultados: {{ link.counterpartConsent.shareResults ? 'La otra empresa ya lo permitió' : 'Aún no lo permite' }}</p>
                    @if (link.status === 'ENDED') {
                      <p class="note" data-testid="recon-ended">El vínculo finalizó: ya no se buscan coincidencias ni se muestran valores de la otra empresa. Lo que se confirmó antes se conserva como historial.</p>
                    } @else {
                      <p class="note">Solo vemos si la otra empresa lo permitió, nada más de ella.</p>
                    }
                  </section>
                </div>
              </article>
            </li>
          }
        </ul>
        <app-pager [page]="page()" [pageSize]="pageSize()" [total]="all().length" [sizes]="sizes" (pageChange)="page.set($event)" (sizeChange)="setSize($event)" />
      </app-resource-state>
    </section>
  `,
})
export class ReconciliationConsentComponent {
  protected readonly facade = inject(ReconciliationLinksFacade);
  private readonly access = inject(AccessPolicy);
  private readonly confirm = inject(ConfirmService);
  private readonly toast = inject(ToastService);

  protected readonly sizes = CONSENT_PAGE_SIZES;
  protected readonly page = signal(1);
  protected readonly pageSize = signal(CONSENT_PAGE_SIZES[0]);
  protected readonly canManage = computed(() => this.access.can('relationships:manage'));
  /** Vigentes primero, luego el historial de los finalizados. */
  protected readonly all = computed<readonly ReconciliationLink[]>(() => [...(this.facade.links.data() ?? [])].sort((a, b) => Number(a.status === 'ENDED') - Number(b.status === 'ENDED')));
  protected readonly visible = computed(() => this.all().slice((this.page() - 1) * this.pageSize(), this.page() * this.pageSize()));

  constructor() {
    reloadOnContextChange(() => {
      this.page.set(1);
      this.facade.load();
    });
  }

  protected busy(link: ReconciliationLink): boolean {
    return this.facade.busyId() === link.relationshipId;
  }

  protected setSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }

  /** Estado real de la conciliación: solo está activa si el vínculo está vigente y ambas empresas permitieron buscar. */
  protected effectiveText(link: ReconciliationLink): string {
    if (link.matchingActive) return 'La conciliación está activa';
    if (link.status === 'ENDED') return 'La conciliación terminó con el vínculo';
    if (!link.myConsent.matchingEnabled) return 'La conciliación está inactiva: tu empresa aún no la permite';

    return 'La conciliación está inactiva: falta que la otra empresa la permita';
  }

  protected toggleMatching(link: ReconciliationLink, event: Event): void {
    const input = event.target as HTMLInputElement;
    const enable = input.checked;

    // Al quitar la búsqueda también se quita compartir resultados: no tiene sentido compartir sin buscar.
    void this.apply(link, { matchingEnabled: enable, shareResults: enable ? link.myConsent.shareResults : false }, input, enable ? null : this.revokeMatchingText(link));
  }

  protected toggleShare(link: ReconciliationLink, event: Event): void {
    const input = event.target as HTMLInputElement;
    const enable = input.checked;

    void this.apply(link, { matchingEnabled: link.myConsent.matchingEnabled, shareResults: enable }, input, enable ? null : `${link.counterpart.name} dejará de ver los valores de tus viajes. Lo que ya se confirmó se conserva como historial.`);
  }

  private revokeMatchingText(link: ReconciliationLink): string {
    return `Se detiene la búsqueda de viajes compartidos con ${link.counterpart.name}${link.myConsent.shareResults ? ' y también dejas de compartir tus resultados' : ''}. Lo pendiente se oculta y lo ya confirmado se conserva como historial.`;
  }

  private async apply(link: ReconciliationLink, change: ConsentChange, input: HTMLInputElement, revokeText: string | null): Promise<void> {
    if (revokeText !== null) {
      const accepted = await this.confirm.confirm({ title: 'Revocar permiso', message: revokeText, confirmLabel: 'Revocar', danger: true });

      if (!accepted) {
        input.checked = !input.checked;

        return;
      }
    }

    const enablesMatching = change.matchingEnabled && !link.myConsent.matchingEnabled;

    this.facade.changeConsent(link.relationshipId, change).subscribe({
      next: (updated) => {
        if (enablesMatching && updated.rescanRecommended) return this.rescan(updated);

        this.toast.success(revokeText !== null ? 'Revocaste el permiso. El historial se conserva.' : 'Permiso guardado.');
      },
      error: (error: unknown) => {
        input.checked = !input.checked;

        const app = toAppError(error);

        // Un vínculo que dejó de estar vigente o una lista desactualizada se corrigen recargando.
        if (app.code === 'LINK_NOT_ACTIVE' || app.code === 'LINK_NOT_FOUND') this.facade.load({ background: true });

        this.toast.error(app);
      },
    });
  }

  /** Tras permitir buscar, el servidor recomienda lanzar la búsqueda: se lanza y se cuenta el resultado tal cual. */
  private rescan(link: ReconciliationLink): void {
    this.facade.rescan(link.relationshipId).subscribe({
      next: (result) => this.toast.success(`Permiso guardado. ${rescanMessage(result.candidatesCreated, result.completed)}`),
      error: (error: unknown) => this.toast.error(`El permiso quedó guardado, pero no se pudo iniciar la búsqueda: ${toAppError(error).message}`),
    });
  }
}
