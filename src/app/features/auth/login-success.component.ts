import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * Estado de éxito del acceso: check animado, saludo, hitos y camión que avanza. Los tiempos son relativos a `--t`
 * (la duración que define `LoginComponent` en el contenedor), así que la animación y la navegación no se desfasan.
 */
@Component({
  selector: 'app-login-success',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .success { position: relative; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; padding: 14px 2px 6px; animation: reveal 0.45s ease-out both; }
      .success h1 { font-size: 1.45rem; }
      .badge-wrap { position: relative; width: 96px; height: 96px; display: grid; place-items: center; }
      .tick { position: relative; width: 84px; height: 84px; overflow: visible; }
      .tick .disc { fill: color-mix(in srgb, var(--c-primary) 12%, transparent); transform-origin: center; animation: pop 0.45s cubic-bezier(.2, .7, .2, 1) both; }
      .tick .ring-draw { fill: none; stroke: var(--c-primary-400); stroke-width: 3.5; stroke-linecap: round; stroke-dasharray: 189; stroke-dashoffset: 189; transform: rotate(-90deg); transform-origin: center; animation: draw 0.6s ease-out forwards; }
      .tick .check { fill: none; stroke: var(--c-primary); stroke-width: 4.5; stroke-linecap: round; stroke-linejoin: round; stroke-dasharray: 40; stroke-dashoffset: 40; animation: draw 0.4s 0.45s ease-out forwards; }
      @keyframes draw { to { stroke-dashoffset: 0; } }
      @keyframes pop { from { transform: scale(0.85); opacity: 0; } to { transform: scale(1); opacity: 1; } }
      .greet { font-size: 1.05rem; font-weight: 700; color: var(--c-accent); margin-top: -6px; animation: reveal 0.5s 0.35s ease-out both; }
      .dest { color: var(--c-mu); animation: reveal 0.5s 0.5s ease-out both; }
      .milestones { list-style: none; margin: 4px 0 0; padding: 0; width: 100%; display: flex; flex-direction: column; gap: 8px; text-align: left; }
      .milestones li { display: flex; align-items: center; gap: 10px; font-size: 0.92rem; color: var(--c-head); opacity: 0; transform: translateY(6px); animation: stepIn 0.45s ease-out forwards; }
      .milestones li:nth-child(1) { animation-delay: calc(var(--t) * 0.16); }
      .milestones li:nth-child(2) { animation-delay: calc(var(--t) * 0.36); }
      .milestones li:nth-child(3) { animation-delay: calc(var(--t) * 0.56); }
      .milestones .dot { flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--c-primary); display: grid; place-items: center; }
      .milestones .dot svg { width: 12px; height: 12px; fill: none; stroke: #fff; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
      @keyframes stepIn { to { opacity: 1; transform: none; } }
      .journey { position: relative; width: 100%; margin-top: 8px; padding-top: 26px; }
      .bar { width: 100%; height: 4px; border-radius: 2px; background: var(--c-gray-200); overflow: hidden; }
      .bar span { display: block; height: 100%; width: 100%; transform-origin: left; background: var(--c-primary); animation: fill calc(var(--t) - 700ms) 0.2s linear forwards; transform: scaleX(0); }
      @keyframes fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
      .mini-truck { position: absolute; top: 0; left: 0; width: 34px; height: 22px; animation: drive calc(var(--t) - 700ms) 0.2s linear forwards; }
      .mini-truck svg { width: 100%; height: 100%; overflow: visible; }
      .mini-truck .streak { stroke: var(--c-primary-400); stroke-width: 2; stroke-linecap: round; opacity: 0.55; animation: streak 0.35s linear infinite; }
      .mini-truck .wheel { transform-box: fill-box; transform-origin: center; animation: spin 0.5s linear infinite; }
      @keyframes drive { from { left: 0; } to { left: calc(100% - 34px); } }
      @keyframes streak { 0% { transform: translateX(2px); opacity: 0.1; } 100% { transform: translateX(-6px); opacity: 0.6; } }
      .skip { margin-top: 4px; font-size: 0.88rem; }
      @keyframes reveal { to { opacity: 1; transform: none; } }
      @keyframes spin { to { transform: rotate(360deg); } }
      @media (prefers-reduced-motion: reduce) {
        .success, .tick .disc, .tick .ring-draw, .tick .check, .bar span, .greet, .dest, .milestones li, .mini-truck, .mini-truck .streak, .mini-truck .wheel { animation: none !important; }
        .tick .ring-draw, .tick .check { stroke-dashoffset: 0; }
        .bar span { transform: none; }
        .milestones li { opacity: 1; transform: none; }
        .mini-truck { left: calc(100% - 34px); }
        .mini-truck .streak { display: none; }
      }
    `,
  ],
  template: `
    <div class="success" role="status" aria-live="polite" data-testid="login-success">
      <div class="badge-wrap" aria-hidden="true">
        <svg class="tick" viewBox="0 0 72 72">
          <circle class="disc" cx="36" cy="36" r="30" />
          <circle class="ring-draw" cx="36" cy="36" r="30" />
          <path class="check" d="M24 37l8 8 16-17" />
        </svg>
      </div>
      <h1>Acceso verificado</h1>
      @if (firstName()) { <p class="greet" data-testid="login-greeting">¡Hola, {{ firstName() }}!</p> }
      <p class="dest">{{ destination() === 'platform' ? 'Abriendo la consola de plataforma…' : 'Preparando tu espacio de trabajo…' }}</p>
      <ul class="milestones" aria-hidden="true">
        <li><span class="dot"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg></span>Identidad verificada</li>
        <li><span class="dot"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg></span>Permisos cargados</li>
        <li><span class="dot"><svg viewBox="0 0 24 24"><path d="M5 12l5 5 9-10" /></svg></span>{{ destination() === 'platform' ? 'Consola de plataforma lista' : 'Espacio de trabajo listo' }}</li>
      </ul>
      <div class="journey" aria-hidden="true">
        <div class="mini-truck">
          <svg viewBox="0 0 34 22">
            <path class="streak" d="M-4 8h6M-6 13h8M-3 18h5" />
            <rect x="2" y="3" width="19" height="12" rx="2" style="fill: var(--c-primary)" />
            <path d="M21 7h6l5 4v4H21z" style="fill: var(--c-secondary)" />
            <circle class="wheel" cx="9" cy="17" r="3.2" fill="#51534a" /><circle class="wheel" cx="26" cy="17" r="3.2" fill="#51534a" />
            <circle cx="9" cy="17" r="1" fill="#fff" /><circle cx="26" cy="17" r="1" fill="#fff" />
          </svg>
        </div>
        <div class="bar"><span></span></div>
      </div>
      <button type="button" class="btn btn-ghost skip" data-testid="login-skip" (click)="skip.emit()">Entrar ahora</button>
    </div>
  `,
})
export class LoginSuccessComponent {
  readonly firstName = input('');
  readonly destination = input<'platform' | 'workspace'>('workspace');
  /** «Entrar ahora»: la persona prefiere no esperar la animación. */
  readonly skip = output<void>();
}
