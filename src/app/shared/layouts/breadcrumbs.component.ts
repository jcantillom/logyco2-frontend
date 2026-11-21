import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterLink } from '@angular/router';
import { filter, startWith } from 'rxjs';

export interface Crumb {
  readonly label: string;
  readonly url: string;
}

/** Construye las migas a partir de `data.breadcrumb` de cada ruta activa. */
export function buildCrumbs(root: ActivatedRouteSnapshot): Crumb[] {
  const crumbs: Crumb[] = [];
  let url = '';
  let current: ActivatedRouteSnapshot | null = root;

  while (current) {
    const segment = current.url.map((part) => part.path).join('/');
    if (segment) url += `/${segment}`;
    const label = current.data['breadcrumb'] as string | undefined;
    // Una ruta hija con path vacío hereda `data` de su padre: sin esta guarda, la miga se repetiría.
    if (label && crumbs.at(-1)?.url !== url) crumbs.push({ label, url });
    current = current.firstChild;
  }
  return crumbs;
}

@Component({
  selector: 'app-breadcrumbs',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    'ol { display: flex; flex-wrap: wrap; gap: 6px; list-style: none; margin: 0; padding: 0; font-size: 0.88rem; color: var(--c-mu); } li + li::before { content: "/"; margin-right: 6px; color: var(--c-gray-400); } a { color: var(--c-mu); } [aria-current] { color: var(--c-head); font-weight: 700; }',
  ],
  template: `
    <nav aria-label="Ruta de navegación">
      <ol>
        <li><a [routerLink]="rootLink()">{{ rootLabel() }}</a></li>
        @for (crumb of crumbs(); track crumb.url; let last = $last) {
          <li>
            @if (last) {
              <span aria-current="page">{{ crumb.label }}</span>
            } @else {
              <a [routerLink]="crumb.url">{{ crumb.label }}</a>
            }
          </li>
        }
      </ol>
    </nav>
  `,
})
export class BreadcrumbsComponent {
  /** Raíz de las migas: «LoGyCO₂» en el espacio de empresa, «Plataforma» en la consola global. */
  readonly rootLabel = input('LoGyCO₂');
  readonly rootLink = input('/resumen');

  private readonly router = inject(Router);
  protected readonly crumbs = signal<readonly Crumb[]>([]);

  constructor() {
    this.router.events
      .pipe(
        filter((event) => event instanceof NavigationEnd),
        startWith(null),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.crumbs.set(buildCrumbs(this.router.routerState.snapshot.root)));
  }
}
