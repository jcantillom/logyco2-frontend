import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, viewChild } from '@angular/core';
import { ActionFeedbackService } from '../../core/notifications/action-feedback.service';

/** Aviso central de acciones: el mismo camión del acceso mientras se ejecuta y un check al terminar. */
@Component({
  selector: 'app-action-feedback-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      dialog { border: 0; border-radius: 16px; padding: 28px 32px 24px; left: var(--dlg-left, 0px); width: min(360px, calc(100vw - var(--dlg-left, 0px) - 32px)); box-shadow: 0 24px 60px rgba(81, 83, 74, 0.28); text-align: center; background: var(--c-sf); }
      dialog::backdrop { background: rgba(81, 83, 74, 0.45); backdrop-filter: blur(2px); }
      h2 { font-size: 1.1rem; margin: 14px 0 4px; }
      p { margin: 0; color: var(--c-mu, var(--c-info)); font-size: 0.92rem; }
      .journey { position: relative; width: 100%; padding-top: 26px; }
      .bar { width: 100%; height: 6px; border-radius: 3px; background: var(--c-s3); overflow: hidden; }
      .bar span { display: block; height: 100%; width: 40%; border-radius: 3px; background: var(--c-primary); animation: slide 1.8s ease-in-out infinite alternate; }
      .truck { position: absolute; top: 0; left: 0; width: 34px; height: 22px; animation: drive 1.8s ease-in-out infinite alternate; }
      .truck svg { width: 100%; height: 100%; overflow: visible; }
      .streak { stroke: var(--c-primary-400); stroke-width: 2; stroke-linecap: round; opacity: 0.55; animation: streak 0.35s linear infinite; }
      .wheel { transform-box: fill-box; transform-origin: center; animation: spin 0.5s linear infinite; }
      @keyframes drive { from { left: 0; } to { left: calc(100% - 34px); } }
      @keyframes slide { from { margin-left: 0; } to { margin-left: 60%; } }
      @keyframes streak { 0% { transform: translateX(2px); opacity: 0.1; } 100% { transform: translateX(-6px); opacity: 0.6; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      .tick { width: 72px; height: 72px; }
      .tick .disc { fill: var(--c-secondary-100); }
      .tick .ring { fill: none; stroke: var(--c-secondary-300); stroke-width: 4; stroke-linecap: round; stroke-dasharray: 189; stroke-dashoffset: 189; animation: draw 0.8s ease-out forwards; }
      .tick .check { fill: none; stroke: var(--c-secondary); stroke-width: 5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 48; stroke-dashoffset: 48; animation: draw 0.6s 0.7s ease-out forwards; }
      @keyframes draw { to { stroke-dashoffset: 0; } }
      @media (prefers-reduced-motion: reduce) {
        .truck, .bar span, .streak, .wheel, .tick .ring, .tick .check { animation: none !important; }
        .tick .ring, .tick .check { stroke-dashoffset: 0; }
        .truck { left: calc(50% - 17px); }
        .bar span { width: 100%; }
        .streak { display: none; }
      }
    `,
  ],
  template: `
    <dialog #dialog aria-live="polite" (cancel)="$event.preventDefault()" data-testid="action-feedback">
      @if (feedback.state(); as state) {
        @if (state.phase === 'working') {
          <div class="journey" aria-hidden="true">
            <div class="truck">
              <svg viewBox="0 0 34 22">
                <path class="streak" d="M-4 8h6M-6 13h8M-3 18h5" />
                <rect x="2" y="3" width="19" height="12" rx="2" style="fill: var(--c-primary)" />
                <path d="M21 7h6l5 4v4H21z" style="fill: var(--c-accent)" />
                <circle class="wheel" cx="9" cy="17" r="3.2" fill="#51534a" /><circle class="wheel" cx="26" cy="17" r="3.2" fill="#51534a" />
                <circle cx="9" cy="17" r="1" fill="#fff" /><circle cx="26" cy="17" r="1" fill="#fff" />
              </svg>
            </div>
            <div class="bar"><span></span></div>
          </div>
          <h2 role="status">{{ state.label }}</h2>
          <p>Esto toma solo un momento.</p>
        } @else {
          <svg class="tick" viewBox="0 0 72 72" aria-hidden="true">
            <circle class="disc" cx="36" cy="36" r="30" />
            <circle class="ring" cx="36" cy="36" r="30" />
            <path class="check" d="M24 37l8 8 16-17" />
          </svg>
          <h2 role="status">{{ state.message }}</h2>
        }
      }
    </dialog>
  `,
})
export class ActionFeedbackHostComponent {
  protected readonly feedback = inject(ActionFeedbackService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  constructor() {
    effect(() => {
      const element = this.dialog().nativeElement;
      if (this.feedback.state()) {
        if (!element.open) element.showModal();
      } else if (element.open) {
        element.close();
      }
    });
  }
}
