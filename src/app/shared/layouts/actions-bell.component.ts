import { ChangeDetectionStrategy, Component, ElementRef, HostListener, inject, input, signal } from '@angular/core';
import { NavigationEnd, Params, Router, RouterLink } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';

export interface BellAlert {
  readonly label: string;
  readonly hint: string;
  readonly count: number;
  readonly path: string;
  readonly query?: Params;
}

/** Campana de «Acciones pendientes»: solo lista lo que requiere atención y lleva al lugar donde se resuelve. */
@Component({
  selector: 'app-actions-bell',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { position: relative; display: inline-block; }
      .bell { position: relative; display: inline-grid; place-items: center; width: 38px; height: 38px; border-radius: 50%; color: var(--c-head); border: 0; background: none; padding: 0; cursor: pointer; font: inherit; transition: background 0.15s; }
      .bell:hover { background: rgb(81 83 74 / 7%); }
      .bell:focus-visible { outline: 3px solid var(--c-secondary-soft); }
      .bell svg { width: 22px; height: 22px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .bell .count { position: absolute; top: 1px; right: 0; min-width: 18px; height: 18px; padding: 0 4px; border-radius: 9px; background: var(--c-danger); color: #fff; font-size: 0.68rem; font-weight: 800; display: grid; place-items: center; }
      .panel { position: absolute; top: calc(100% + 10px); right: 0; width: min(360px, 92vw); background: var(--c-sf); border: 1px solid var(--c-bd); border-radius: 14px; box-shadow: 0 18px 40px color-mix(in srgb, var(--c-gray) 14%, transparent); z-index: 70; overflow: hidden; }
      .panel header { display: flex; align-items: center; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--c-bd); font-size: 0.9rem; color: var(--c-head); }
      .panel .n { padding: 1px 8px; border-radius: 999px; background: var(--c-bad-soft); color: var(--c-danger); font-size: 0.72rem; font-weight: 800; }
      .panel ul { list-style: none; margin: 0; padding: 6px; }
      .panel li a { display: flex; align-items: center; gap: 12px; padding: 10px; border-radius: 10px; text-decoration: none; color: inherit; }
      .panel li a:hover { background: var(--c-s2); }
      .panel .txt { display: flex; flex-direction: column; min-width: 0; flex: 1; }
      .panel .txt strong { font-size: 0.84rem; color: var(--c-head); }
      .panel .txt span { font-size: 0.74rem; color: var(--c-mu); line-height: 1.35; }
      .panel .num { min-width: 28px; text-align: center; padding: 2px 8px; border-radius: 999px; background: var(--c-bad-soft); color: var(--c-danger); font-weight: 800; font-size: 0.8rem; }
      .panel .all-clear { display: flex; align-items: center; gap: 10px; margin: 0; padding: 18px 16px; font-size: 0.84rem; color: var(--c-mu); }
      .panel .all-clear svg { width: 22px; height: 22px; flex: none; fill: var(--c-ok-soft); stroke: var(--c-primary); stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
    `,
  ],
  template: `
    <button type="button" class="bell" aria-haspopup="true" [attr.aria-expanded]="open()" aria-controls="bell-panel" [attr.aria-label]="pending() ? 'Acciones pendientes: ' + pending() : 'Sin acciones pendientes'" data-testid="bell" (click)="open.set(!open())">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 6 2 7 2 7H4s2-1 2-7M10 20a2 2 0 0 0 4 0" /></svg>
      @if (pending() > 0) { <span class="count">{{ pending() }}</span> }
    </button>
    @if (open()) {
      <div class="panel" id="bell-panel" role="region" aria-label="Acciones pendientes" data-testid="bell-panel">
        <header><strong>Acciones pendientes</strong>@if (pending() > 0) { <span class="n">{{ pending() }}</span> }</header>
        @if (alerts().length === 0) {
          <p class="all-clear" data-testid="bell-empty"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8 12l3 3 5-6" /></svg>Todo al día. No hay acciones pendientes.</p>
        } @else {
          <ul>
            @for (item of alerts(); track item.label) {
              <li>
                <a [routerLink]="item.path" [queryParams]="item.query" (click)="open.set(false)">
                  <span class="txt"><strong>{{ item.label }}</strong><span>{{ item.hint }}</span></span>
                  <span class="num">{{ item.count }}</span>
                </a>
              </li>
            }
          </ul>
        }
      </div>
    }
  `,
})
export class ActionsBellComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly alerts = input.required<readonly BellAlert[]>();
  readonly pending = input(0);
  protected readonly open = signal(false);

  constructor() {
    inject(Router)
      .events.pipe(
        filter((event) => event instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe(() => this.open.set(false));
  }

  @HostListener('document:keydown.escape')
  protected onEscape(): void {
    this.open.set(false);
  }

  @HostListener('document:click', ['$event'])
  protected onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }
}
