import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Params, RouterLink } from '@angular/router';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { ICON_CHIP_STYLES } from './icon-chip.styles';
import { KPI_TILE_STYLES } from './kpi-tile.styles';

/**
 * Tarjeta de indicador: etiqueta, cifra grande, pie y chip de ícono plano. Con `link` es un enlace (su nombre accesible incluye la cifra);
 * sin él, una tarjeta informativa. Cada tarjeta tiene su propio estado de carga y de error. `tone` colorea la cifra y el chip
 * (`warn` ámbar, `bad` rojo, `neutral` gris, vacío naranja de marca).
 */
@Component({
  selector: 'app-kpi-tile',
  imports: [NgTemplateOutlet, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    KPI_TILE_STYLES,
    ICON_CHIP_STYLES,
    `
      :host { display: block; min-width: 0; }
      .kpi { height: 100%; }
      .kpi .value { color: var(--c-head); }
      .kpi.warn .value, .kpi.bad .value { color: var(--tone); }
    `,
  ],
  template: `
    @if (link(); as target) {
      <a class="kpi has-cap" [class]="tone()" [class.sm]="size() === 'sm'" [routerLink]="target" [queryParams]="query()" [attr.aria-label]="accessibleName()"><ng-container *ngTemplateOutlet="body" /></a>
    } @else {
      <div class="kpi has-cap" [class]="tone()" [class.sm]="size() === 'sm'" role="group" [attr.aria-label]="accessibleName()"><ng-container *ngTemplateOutlet="body" /></div>
    }
    <ng-template #body>
      <span class="label">{{ label() }}</span>
      @switch (status()) {
        @case ('error') { <p class="err" role="alert">No se pudo cargar. <button type="button" (click)="retry.emit()">Reintentar</button></p> }
        @case ('ready') { <b class="value" data-testid="kpi-value">{{ value() }}</b> }
        @default { <span class="skeleton sk" role="status" aria-busy="true"><span class="sr-only">Cargando…</span></span> }
      }
      <span class="ico" [class.chip]="size() === 'sm'" [class.solid]="iconSolid()" aria-hidden="true"><svg viewBox="0 0 24 24"><path [attr.d]="icon()" /></svg></span>
      <span class="cap" [attr.title]="caption()">{{ caption() }}</span>
    </ng-template>
  `,
})
export class KpiTileComponent {
  readonly label = input.required<string>();
  readonly value = input<number | string | null>(null);
  readonly caption = input('');
  /** Trazo SVG (viewBox 24). */
  readonly icon = input.required<string>();
  /** Glifo sólido (relleno `currentColor`, sin trazo, huecos `evenodd`); por defecto el glifo es de trazo. */
  readonly iconSolid = input(false);
  readonly tone = input<'' | 'warn' | 'bad' | 'neutral'>('');
  readonly status = input<ResourceStatus>('ready');
  readonly link = input<string | null>(null);
  readonly query = input<Params | null>(null);
  /** `sm`: versión compacta (≈ 80 px) para filas de resumen; `md` (por defecto) es el tamaño de siempre. */
  readonly size = input<'md' | 'sm'>('md');
  readonly retry = output();

  protected readonly accessibleName = computed(() => (this.status() === 'ready' ? `${this.label()}: ${this.value()}. ${this.caption()}`.trim() : this.label()));
}
