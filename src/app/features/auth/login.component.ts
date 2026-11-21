import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { AuthFacade } from '../../core/auth/auth.facade';
import { LandingPolicy } from '../../core/auth/landing-policy';
import { SessionStore } from '../../core/auth/session.store';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { LogoComponent, LogycaLogoComponent } from '../../shared/ui/logo.component';
import { LoginSuccessComponent } from './login-success.component';

/** Recorrido principal de la plataforma, mostrado como píldoras que se iluminan en secuencia. */
const STEPS: readonly { label: string; icon: string }[] = [
  { label: 'Registra', icon: 'M4 6h16M4 12h16M4 18h10' },
  { label: 'Mide', icon: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2' },
  { label: 'Compara', icon: 'M5 20V10M12 20V4M19 20v-7' },
  { label: 'Reduce', icon: 'M4 7l6 6 4-4 6 7M20 16v-4h-4' },
];

/**
 * Duración del estado de éxito antes de navegar (ms): lo bastante larga para leer el saludo y ver
 * los hitos. Es la ÚNICA fuente del tiempo: la animación CSS la recibe como `--t`. Con movimiento
 * reducido no hay animación, pero se deja el mensaje visible un momento para poder leerlo.
 */
export const SUCCESS_MS = 5000;
export const SUCCESS_REDUCED_MS = 900;
/** Partículas que brotan del check (decorativas). */

const ROUTE = 'M-20 700C110 700 170 600 270 600S400 500 470 440S560 300 600 210S650 120 660 90';

@Component({
  selector: 'app-login',
  imports: [ReactiveFormsModule, LogoComponent, LogycaLogoComponent, LoginSuccessComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { display: block; }
      .wrap { min-height: 100vh; min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr); }

      /* ── Panel de marca ── */
      .brand-panel { --mx: 30%; --my: 25%; position: relative; isolation: isolate; overflow: hidden; color: #fff; padding: clamp(28px, 4vw, 56px); display: flex; flex-direction: column; gap: clamp(22px, 3.6vh, 44px);
        background: radial-gradient(900px circle at 85% 8%, #5d5f56 0%, transparent 60%), linear-gradient(160deg, #484a42 0%, #51534a 55%, #484a42 120%); }
      .brand-panel::before { content: ''; position: absolute; inset: 0; z-index: -2; pointer-events: none;
        background: radial-gradient(420px circle at var(--mx) var(--my), rgb(252 76 2 / 22%), transparent 70%); }
      .brand-panel::after { content: ''; position: absolute; inset: 0; z-index: -2; pointer-events: none; background-image: linear-gradient(rgb(255 255 255 / 5%) 1px, transparent 1px), linear-gradient(90deg, rgb(255 255 255 / 5%) 1px, transparent 1px); background-size: 52px 52px; mask-image: radial-gradient(ellipse 70% 60% at 15% 95%, #000, transparent 75%); }
      .blob { position: absolute; z-index: -3; border-radius: 50%; filter: blur(70px); pointer-events: none; will-change: transform; }
      .b1 { width: 380px; height: 380px; left: -120px; top: -90px; background: #fc4c02; opacity: 0.28; animation: drift1 22s ease-in-out infinite alternate; }
      .b2 { width: 320px; height: 320px; right: -80px; bottom: 6%; background: #00b398; opacity: 0.2; animation: drift2 26s ease-in-out infinite alternate; }
      .b3 { width: 280px; height: 280px; left: 28%; bottom: -120px; background: #fc4c02; opacity: 0.3; animation: drift1 30s ease-in-out infinite alternate-reverse; }
      @keyframes drift1 { to { transform: translate3d(90px, 60px, 0) scale(1.15); } }
      @keyframes drift2 { to { transform: translate3d(-110px, -70px, 0) scale(1.2); } }

      .visual { position: absolute; top: 0; right: 0; width: 54%; height: 100%; z-index: -1; pointer-events: none; transform: translate3d(calc(var(--px, 0) * -14px), calc(var(--py, 0) * -10px), 0); transition: transform 0.25s ease-out; mask-image: linear-gradient(90deg, transparent 18%, #000 58%); }
      .flow { stroke-dasharray: 2 14; animation: flow 1.6s linear infinite; }
      @keyframes flow { to { stroke-dashoffset: -32; } }
      .truck { offset-path: path('${ROUTE}'); offset-rotate: 0deg; animation: travel 9s linear infinite; }
      .truck.t2 { animation-delay: -4.5s; animation-duration: 11s; }
      @keyframes travel { from { offset-distance: 0%; } to { offset-distance: 100%; } }
      .ping { transform-box: fill-box; transform-origin: center; opacity: 0; animation: ping 12s ease-out infinite; animation-delay: calc(var(--i) * 3s); }
      @keyframes ping { 0%, 4% { transform: scale(0.5); opacity: 0; } 6% { opacity: 0.7; } 20%, 100% { transform: scale(3.4); opacity: 0; } }
      .node-label { fill: #fff; font: 700 13px 'Museo Sans', Arial, sans-serif; opacity: 0.55; animation: nodeLabel 12s ease-in-out infinite; animation-delay: calc(var(--i) * 3s); }
      .node-label.goal { fill: #66d1c1; }
      @keyframes nodeLabel { 0%, 30%, 100% { opacity: 0.55; } 6%, 22% { opacity: 1; } }

      .reveal { opacity: 0; transform: translateY(14px); animation: reveal 0.8s cubic-bezier(.2, .7, .2, 1) forwards; animation-delay: calc(var(--d, 0) * 1ms); }
      @keyframes reveal { to { opacity: 1; transform: none; } }

      .copy { margin-block: auto; max-width: 40rem; display: flex; flex-direction: column; gap: 20px; }
      .headline { margin: 0; color: #fff; font-size: clamp(2.1rem, 3.5vw, 3.8rem); line-height: 1.04; font-weight: 800; letter-spacing: -0.03em; text-wrap: balance; }
      .headline em { font-style: normal; background: linear-gradient(90deg, #fc4c02, #fd9467, #fc4c02); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: shine 6s linear infinite; }
      @keyframes shine { to { background-position: -200% 0; } }
      .desc { margin: 0; color: #dcdddb; font-size: 1.1rem; line-height: 1.6; max-width: 34rem; }
      .steps { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 12px; counter-reset: step; }
      .step { counter-increment: step; display: inline-flex; align-items: center; gap: 9px; padding: 9px 18px 9px 10px; border-radius: 999px; font-weight: 600; font-size: 0.96rem; color: #eeeeed;
        background: rgb(72 74 66 / 82%); border: 1px solid rgb(255 255 255 / 14%); backdrop-filter: blur(14px); animation: lit 12s ease-in-out infinite; animation-delay: calc(var(--i) * 3s); }
      .step::before { content: counter(step, decimal-leading-zero); display: grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; background: rgb(255 255 255 / 10%); font-size: 0.68rem; font-weight: 800; letter-spacing: 0.02em; }
      .step:last-child { animation-name: lit-goal; }
      .step svg { width: 18px; height: 18px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
      @keyframes lit { 0%, 30%, 100% { background: rgb(72 74 66 / 82%); border-color: rgb(255 255 255 / 14%); color: #eeeeed; transform: none; box-shadow: none; }
        6%, 22% { background: color-mix(in srgb, #fc4c02 24%, rgb(72 74 66)); border-color: rgb(252 76 2 / 70%); color: #fff; transform: translateY(-3px); box-shadow: 0 10px 28px -10px rgb(252 76 2 / 75%); } }
      @keyframes lit-goal { 0%, 30%, 100% { background: rgb(72 74 66 / 82%); border-color: rgb(255 255 255 / 14%); color: #eeeeed; transform: none; box-shadow: none; }
        6%, 22% { background: color-mix(in srgb, #00b398 26%, rgb(72 74 66)); border-color: rgb(0 179 152 / 75%); color: #fff; transform: translateY(-3px); box-shadow: 0 10px 28px -10px rgb(0 179 152 / 75%); } }
      .tagline { margin: 0; display: inline-flex; align-items: center; gap: 10px; color: #fff; font-weight: 600; letter-spacing: 0.01em; }
      .tagline::before { content: ''; width: 28px; height: 3px; border-radius: 2px; background: #00b398; flex: none; }
      .signature { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; color: #dcdddb; font-size: 0.88rem; }

      /* ── Panel de acceso ── */
      .form-panel { position: relative; overflow: hidden; isolation: isolate; display: grid; place-items: center; padding: clamp(24px, 4vw, 48px) 20px; background-color: var(--c-bg); background-image: radial-gradient(circle at 1px 1px, rgb(81 83 74 / 16%) 1.2px, transparent 0); background-size: 26px 26px; }
      .form-panel::before { content: ''; position: absolute; z-index: -1; width: 420px; height: 420px; right: -140px; top: -120px; border-radius: 50%; background: radial-gradient(circle, rgb(252 76 2 / 18%), transparent 68%); }
      .form-panel::after { content: ''; position: absolute; z-index: -1; width: 520px; height: 520px; left: -200px; bottom: -260px; border-radius: 50%; border: 1.5px solid rgb(252 76 2 / 12%); box-shadow: 0 0 0 60px rgb(252 76 2 / 4%), 0 0 0 120px rgb(252 76 2 / 3%); }
      /* Tarjeta con volumen sin inclinación: luz interior, hojas apiladas y sombra profunda. */
      form { position: relative; width: min(460px, 100%); display: flex; flex-direction: column; gap: 20px; padding: clamp(24px, 3.2vw, 40px); background: linear-gradient(160deg, #fff 0%, #f3f4f3 100%); border: 1px solid #fff; border-radius: 26px; box-shadow: inset 0 2px 0 #fff, inset 0 -3px 0 rgb(81 83 74 / 9%), 0 12px 0 -4px rgb(0 179 152 / 24%), 0 24px 0 -8px rgb(0 179 152 / 11%), 0 46px 70px -22px rgb(81 83 74 / 55%); }
      form { transition: box-shadow 0.3s, border-color 0.3s; }
      form:focus-within { box-shadow: inset 0 2px 0 #fff, inset 0 -3px 0 rgb(81 83 74 / 9%), 0 12px 0 -4px rgb(0 179 152 / 30%), 0 24px 0 -8px rgb(0 179 152 / 14%), 0 46px 70px -22px rgb(81 83 74 / 55%), 0 0 0 6px rgb(0 179 152 / 10%); }
      form h1 { font-size: clamp(1.6rem, 2.4vw, 2.05rem); letter-spacing: -0.02em; }
      .caps { display: inline-flex; align-items: center; gap: 6px; color: var(--c-warning); font-size: 0.85rem; font-weight: 600; }
      form .input { transition: border-color 0.15s, box-shadow 0.2s; }
      form .input { min-height: 50px; padding-left: 46px; border-radius: 12px; box-shadow: inset 0 2px 5px rgb(81 83 74 / 12%); }
      form .input:focus { outline: none; border-color: #fc4c02; box-shadow: inset 0 2px 5px rgb(81 83 74 / 12%), 0 0 0 4px rgb(252 76 2 / 18%); }
      .inp { position: relative; }
      .lead { position: absolute; left: 15px; top: 50%; width: 20px; height: 20px; margin-top: -10px; fill: none; stroke: var(--c-gray-700); stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; pointer-events: none; transition: stroke 0.2s; }
      .inp:focus-within .lead { stroke: #fc4c02; }
      .pw { position: relative; }
      .pw .lead { left: 15px; }
      .pw .input { padding-right: 48px; }
      .pw button { position: absolute; top: 3px; right: 3px; width: 36px; height: 36px; display: grid; place-items: center; border: 0; border-radius: 6px; background: transparent; color: var(--c-gray-700); cursor: pointer; }
      .pw button:hover { background: rgb(81 83 74 / 8%); }
      .pw svg { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
      .cta { position: relative; overflow: hidden; min-height: 52px; border: 0; border-radius: 12px; background: linear-gradient(135deg, #fc4c02, #e24d0d); font-size: 1.02rem; display: inline-flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 5px 0 #b83a00, 0 16px 24px -8px rgb(252 76 2 / 65%); transition: transform 0.12s, box-shadow 0.12s, filter 0.2s; }
      .cta::after { content: ''; position: absolute; inset: 0; background: linear-gradient(110deg, transparent 30%, rgb(255 255 255 / 28%) 50%, transparent 70%); transform: translateX(-120%); }
      .cta:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 6px 0 #b83a00, 0 20px 28px -8px rgb(252 76 2 / 70%); filter: brightness(1.05); }
      .cta:hover:not(:disabled)::after { transform: translateX(120%); transition: transform 0.7s; }
      .cta:active:not(:disabled) { transform: translateY(4px); box-shadow: 0 1px 0 #b83a00, 0 6px 12px -6px rgb(252 76 2 / 60%); }
      .cta .arrow { width: 20px; height: 20px; fill: none; stroke: currentColor; stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; transition: transform 0.25s; }
      .cta:hover:not(:disabled) .arrow { transform: translateX(5px); }
      .spinner { width: 16px; height: 16px; border-radius: 50%; border: 2px solid rgb(255 255 255 / 40%); border-top-color: #fff; animation: spin 0.8s linear infinite; }
      @keyframes spin { to { transform: rotate(360deg); } }
      .secure { display: flex; gap: 8px; align-items: flex-start; color: var(--c-mu); font-size: 0.86rem; }
      .secure svg { width: 16px; height: 16px; flex: none; margin-top: 2px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }

      /* ── Transición de éxito (tiempos relativos a --t = SUCCESS_MS) ── */
      .wipe { position: fixed; inset: 0; z-index: 60; background: var(--c-bg); opacity: 0; animation: wipe 0.5s calc(var(--t) - 500ms) ease-in forwards; }
      @keyframes wipe { to { opacity: 1; } }
      .leaving .flow { animation-duration: 0.35s; }
      .leaving .truck { animation-duration: 2.5s; }
      .leaving .copy, .leaving .signature { opacity: 0.35; transition: opacity 0.5s; }

      @media (max-width: 860px) {
        .wrap { grid-template-columns: minmax(0, 1fr); min-height: 0; }
        .brand-panel { padding: 22px 20px 20px; gap: 16px; }
        .copy { margin-block: 0; gap: 0; }
        .desc, .tagline, .steps, .visual { display: none; }
        .headline { font-size: 1.3rem; max-width: 24rem; }
        .blob { filter: blur(50px); }
        .form-panel { align-items: start; padding-top: 24px; padding-bottom: 36px; }
        form { padding: 20px 18px; border-radius: 18px; box-shadow: inset 0 2px 0 #fff, 0 8px 0 -3px rgb(0 179 152 / 24%), 0 24px 40px -20px rgb(81 83 74 / 50%); }
      }
      @media (prefers-reduced-motion: reduce) {
        .ping { opacity: 0; }
        .blob, .flow, .truck, .ping, .reveal, .headline em, .step, .step:last-child, .wipe { animation: none !important; }
        .wipe { display: none; }
        .reveal { opacity: 1; transform: none; }
        .truck { display: none; }
        .spinner { animation-duration: 2.4s; }
        .cta, .cta::after, .visual { transition: none; transform: none; }
      }
    `,
  ],
  template: `
    <div class="wrap" [style.--t.ms]="successMs()">
      <section class="brand-panel" [class.leaving]="phase() === 'success'" #panel aria-label="Presentación de LoGyCO2" (pointermove)="onPointerMove($event)">
        <span class="blob b1" aria-hidden="true"></span>
        <span class="blob b2" aria-hidden="true"></span>
        <span class="blob b3" aria-hidden="true"></span>

        <!-- Visual abstracto: rutas logísticas que salen de un anillo de medición. Decorativo. -->
        <svg class="visual" viewBox="0 0 640 760" preserveAspectRatio="xMaxYMax slice" aria-hidden="true" focusable="false">
          <defs>
            <pattern id="lg-dots" width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.4" fill="#fff" opacity=".13" /></pattern>
            <linearGradient id="lg-route" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#fc4c02" stop-opacity="0" /><stop offset=".45" stop-color="#fc4c02" stop-opacity=".85" /><stop offset="1" stop-color="#fd7035" /></linearGradient>
          </defs>
          <rect x="240" y="300" width="400" height="460" fill="url(#lg-dots)" />
          <g fill="none" stroke="#fff" opacity=".1" stroke-width="1.5">
            <circle cx="470" cy="470" r="250" /><circle cx="470" cy="470" r="180" /><circle cx="470" cy="470" r="110" />
          </g>
          <path d="${ROUTE}" fill="none" stroke="url(#lg-route)" stroke-width="5" stroke-linecap="round" />
          <path class="flow" d="${ROUTE}" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="2" stroke-linecap="round" />
          <path d="M-20 560C90 560 150 520 230 490S360 430 400 380" fill="none" stroke="#fff" opacity=".14" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="2 12" />
          <g fill="#fc4c02"><circle cx="270" cy="600" r="7" /><circle cx="470" cy="440" r="7" /><circle cx="546.3" cy="336.3" r="7" /></g>
          <circle cx="628.7" cy="150.1" r="7" fill="#00b398" />
          <g>
            <circle class="ping" style="--i: 0" cx="270" cy="600" r="7" fill="#fd7035" /><circle class="ping" style="--i: 1" cx="470" cy="440" r="7" fill="#fd7035" />
            <circle class="ping" style="--i: 2" cx="546.3" cy="336.3" r="7" fill="#fd7035" /><circle class="ping" style="--i: 3" cx="628.7" cy="150.1" r="7" fill="#00b398" />
          </g>
          <g>
            <text class="node-label" style="--i: 0" x="288" y="604">Registra</text><text class="node-label" style="--i: 1" x="488" y="444">Mide</text>
            <text class="node-label" style="--i: 2" x="564" y="340">Compara</text><text class="node-label goal" text-anchor="end" style="--i: 3" x="612" y="154">Reduce</text>
          </g>
          <circle class="truck" r="5" fill="#fff" /><circle class="truck t2" r="4" fill="#fd7035" />
        </svg>

        <div class="reveal" style="--d: 0"><app-logo variant="horizontal" theme="dark" [size]="72" motion="live" /></div>

        <div class="copy">
          <h2 class="headline reveal" style="--d: 250">Transformamos datos logísticos en decisiones para <em>reducir emisiones.</em></h2>
          <p class="desc reveal" style="--d: 450">
            <span class="co2">LoGyCO<sub>2</sub></span> permite medir la huella de carbono del transporte de carga, analizar
            operaciones, comparar indicadores y construir estrategias de descarbonización basadas en información confiable.
          </p>
          <ul class="steps reveal" style="--d: 650" aria-label="Recorrido de la plataforma">
            @for (step of steps; track step.label; let i = $index) {
              <li class="step" [style.--i]="i">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path [attr.d]="step.icon" /></svg>{{ step.label }}
              </li>
            }
          </ul>
          <p class="tagline reveal" style="--d: 850">Medimos el transporte. Impulsamos la descarbonización.</p>
        </div>

        <div class="signature reveal" style="--d: 1000">
          <span>Una plataforma de</span>
          <app-logyca-logo [height]="26" theme="dark" />
        </div>
      </section>

      <section class="form-panel">
        <form class="reveal" style="--d: 200" [formGroup]="form" (ngSubmit)="submit()" novalidate [attr.aria-labelledby]="phase() === 'form' ? 'login-title' : null">
          @if (phase() === 'form') {
          <div>
            <h1 id="login-title">Bienvenido a <span class="co2">LoGyCO<sub>2</sub></span></h1>
            <p class="muted" style="margin-top: 6px">
              Ingresa con tu cuenta autorizada para consultar y gestionar la huella de carbono de tu empresa.
            </p>
          </div>

          @if (reason() === 'expired') {
            <div class="alert alert-warning" role="status" data-testid="expired-notice">Tu sesión expiró. Inicia sesión nuevamente.</div>
          } @else if (hasReturnUrl()) {
            <div class="alert" role="status" data-testid="continue-notice">Inicia sesión para continuar.</div>
          }
          @if (error(); as e) {
            <div class="alert alert-danger" role="alert" data-testid="login-error">
              <div>
                <strong>{{ e.message }}</strong>
                @if (e.retryAfterSeconds) { <div class="small">Reintenta en {{ e.retryAfterSeconds }} s.</div> }
                @if (e.requestId) { <div class="small">Solicitud: <code>{{ e.requestId }}</code></div> }
              </div>
            </div>
          }

          <div class="field">
            <label for="email">Correo electrónico</label>
            <div class="inp">
              <svg class="lead" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 7.5l8.5 6 8.5-6" /></svg>
              <input id="email" class="input" type="email" formControlName="email" autocomplete="username" inputmode="email" spellcheck="false" autocapitalize="none"
                [attr.aria-invalid]="invalid('email')" [attr.aria-describedby]="invalid('email') ? 'email-error' : null" />
            </div>
            @if (invalid('email')) {
              <span id="email-error" class="field-error">
                {{ form.controls.email.hasError('required') ? 'Ingresa tu correo electrónico.' : 'El correo no tiene un formato válido.' }}
              </span>
            }
          </div>

          <div class="field">
            <label for="password">Contraseña</label>
            <div class="pw">
              <svg class="lead" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
              <input id="password" class="input" [type]="showPassword() ? 'text' : 'password'" formControlName="password" autocomplete="current-password"
                [attr.aria-invalid]="invalid('password')" [attr.aria-describedby]="invalid('password') ? 'password-error' : null"
                (keydown)="onKey($event)" (keyup)="onKey($event)" (blur)="capsLock.set(false)" />
              <button type="button" (click)="showPassword.set(!showPassword())" [attr.aria-pressed]="showPassword()"
                [attr.aria-label]="showPassword() ? 'Ocultar contraseña' : 'Mostrar contraseña'" data-testid="toggle-password">
                @if (showPassword()) {
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 6.2A9.8 9.8 0 0 1 12 6c5 0 8.5 4.2 9.6 6a14 14 0 0 1-2.5 3M6.6 7.6A14 14 0 0 0 2.4 12C3.5 13.8 7 18 12 18c1.6 0 3-.4 4.2-1M9.9 9.9a3 3 0 0 0 4.2 4.2" /></svg>
                } @else {
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.4 12C3.5 10.2 7 6 12 6s8.5 4.2 9.6 6c-1.1 1.8-4.6 6-9.6 6S3.5 13.8 2.4 12z" /><circle cx="12" cy="12" r="3" /></svg>
                }
              </button>
            </div>
            @if (capsLock()) { <span class="caps" role="status" data-testid="caps-lock">⇪ Bloq Mayús está activado.</span> }
            @if (invalid('password')) { <span id="password-error" class="field-error">Ingresa tu contraseña.</span> }
          </div>

          <button type="submit" class="btn btn-primary cta" [disabled]="auth.loading()" [attr.aria-busy]="auth.loading()" data-testid="login-submit">
            @if (auth.loading()) { <span class="spinner" aria-hidden="true"></span> Iniciando sesión… } @else { Iniciar sesión <svg class="arrow" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg> }
          </button>

          <p class="secure">
            <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
            <span>Acceso seguro mediante el servicio de autenticación de LOGYCA.</span>
          </p>
          <!-- El manual de marca autoriza el logo CLI solo sobre fondo blanco: la tarjeta lo es en ambos temas. -->
          <div data-testid="login-cli-logo" style="display: flex; justify-content: center; padding-top: 18px; border-top: 1px solid var(--c-bd)">
            <img src="brand/logo-cli.svg" alt="Centro Latinoamericano de Innovación en Logística (CLI)" width="160" height="101" style="display: block" />
          </div>
          } @else {
            <app-login-success [firstName]="firstName()" [destination]="destination()" (skip)="skipTransition()" />
          }
        </form>
      </section>
      @if (phase() === 'success') {
        <div class="wipe" aria-hidden="true"></div>
      }
    </div>
  `,
})
export class LoginComponent {
  protected readonly auth = inject(AuthFacade);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly landing = inject(LandingPolicy);
  private readonly panel = viewChild.required<ElementRef<HTMLElement>>('panel');

  protected readonly steps = STEPS;
  protected readonly error = signal<AppError | null>(null);
  protected readonly showPassword = signal(false);
  protected readonly capsLock = signal(false);
  /** `success`: transición animada tras autenticarse, antes de navegar. */
  protected readonly phase = signal<'form' | 'success'>('form');
  protected readonly successMs = signal(SUCCESS_MS);
  protected readonly firstName = signal('');
  protected readonly destination = signal<'platform' | 'workspace'>('workspace');
  private readonly session = inject(SessionStore);
  private successTarget = '/resumen';
  private navigationTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly reason = signal(this.route.snapshot.queryParamMap.get('reason'));
  protected readonly hasReturnUrl = signal(this.route.snapshot.queryParamMap.has('returnUrl'));

  protected readonly form = inject(FormBuilder).nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required]],
  });

  private frame = 0;

  constructor() {
    this.destroyRef.onDestroy(() => {
      if (this.navigationTimer) clearTimeout(this.navigationTimer);
      if (this.frame) cancelAnimationFrame(this.frame);
    });
  }

  protected invalid(name: 'email' | 'password'): boolean {
    const control = this.form.controls[name];
    return control.invalid && (control.touched || control.dirty);
  }

  /** Avisa si Bloq Mayús está activo mientras se escribe la contraseña. */
  protected onKey(event: KeyboardEvent): void {
    this.capsLock.set(event.getModifierState?.('CapsLock') ?? false);
  }

  /** El foco de luz del panel sigue al cursor (solo gradiente; se omite con movimiento reducido). */
  protected onPointerMove(event: PointerEvent): void {
    if (this.frame || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const element = this.panel().nativeElement;
    this.frame = requestAnimationFrame(() => {
      const rect = element.getBoundingClientRect();
      element.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      element.style.setProperty('--my', `${event.clientY - rect.top}px`);
      element.style.setProperty('--px', ((event.clientX - rect.left) / rect.width - 0.5).toFixed(3));
      element.style.setProperty('--py', ((event.clientY - rect.top) / rect.height - 0.5).toFixed(3));
      this.frame = 0;
    });
  }

  /** Muestra el estado de éxito y navega al terminar la animación (más breve con movimiento reducido). */
  private startSuccessTransition(): void {
    // El destino lo decide la política central: respeta `returnUrl` solo si el contexto es accesible.
    this.successTarget = this.landing.resolve(this.route.snapshot.queryParamMap.get('returnUrl'));
    this.destination.set(this.successTarget.startsWith('/plataforma') ? 'platform' : 'workspace');
    this.firstName.set(this.session.user()?.fullName?.trim().split(/\s+/)[0] ?? '');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = reduced ? SUCCESS_REDUCED_MS : SUCCESS_MS;
    this.successMs.set(duration);
    this.phase.set('success');
    this.navigationTimer = setTimeout(() => this.navigateNow(), duration);
  }

  /** «Entrar ahora»: quien no quiere esperar la animación puede continuar de inmediato. */
  protected skipTransition(): void {
    this.navigateNow();
  }

  private navigateNow(): void {
    if (this.navigationTimer) clearTimeout(this.navigationTimer);
    this.navigationTimer = null;
    void this.router.navigateByUrl(this.successTarget);
  }

  protected submit(): void {
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      // Lleva el foco al primer campo inválido una vez renderizado su estado de error.
      setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
      return;
    }
    if (this.auth.loading()) return;

    this.error.set(null);
    this.showPassword.set(false);
    this.capsLock.set(false);
    const { email, password } = this.form.getRawValue();

    this.auth
      .login({ email: email.trim(), password })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.form.controls.password.reset('');
          this.startSuccessTransition();
        },
        error: (error: unknown) => {
          const appError = toAppError(error);
          this.form.controls.password.reset('');
          if (appError.code === 'USER_NOT_REGISTERED') {
            void this.router.navigate(['/aceptar-invitacion']);
            return;
          }
          this.error.set(appError);
          setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('#password')?.focus());
        },
      });
  }
}
