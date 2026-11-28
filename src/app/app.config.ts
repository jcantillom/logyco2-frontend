import { IMAGE_CONFIG, registerLocaleData } from '@angular/common';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import localeEsCo from '@angular/common/locales/es-CO';
import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
  provideZoneChangeDetection,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { environment } from '../environments/environment';
import { SessionBootstrap } from './core/auth/session-bootstrap';
import { APP_CONFIG } from './core/config/app-config';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { errorInterceptor } from './core/interceptors/error.interceptor';
import { provideRepositories } from './infrastructure/providers';
import { routes } from './app.routes';

registerLocaleData(localeEsCo);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes, withComponentInputBinding()),
    // Orden: primero credenciales y cabecera anti-CSRF, después se interpretan los errores.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    // El logo institucional de LOGYCA se sirve tal como lo entrega la empresa (sin reescalar).
    { provide: IMAGE_CONFIG, useValue: { disableImageSizeWarning: true, disableImageLazyLoadWarning: true } },
    { provide: APP_CONFIG, useValue: environment },
    provideRepositories(),
    // Antes de la primera navegación: restaura la sesión desde la cookie HttpOnly (GET /auth/me) para que los guards la vean resuelta.
    provideAppInitializer(() => inject(SessionBootstrap).restore()),
  ],
};
