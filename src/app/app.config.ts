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
import { SessionPersistence } from './core/auth/session-persistence';
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
    // Orden: primero se adjunta el token, después se interpretan los errores.
    provideHttpClient(withInterceptors([authInterceptor, errorInterceptor])),
    { provide: LOCALE_ID, useValue: 'es-CO' },
    // El logo institucional de LOGYCA se sirve tal como lo entrega la empresa (sin reescalar).
    { provide: IMAGE_CONFIG, useValue: { disableImageSizeWarning: true, disableImageLazyLoadWarning: true } },
    { provide: APP_CONFIG, useValue: environment },
    provideRepositories(),
    // Antes de la primera navegación: restaura (y revalida) la sesión de esta pestaña si el entorno lo permite.
    provideAppInitializer(() => inject(SessionPersistence).restore()),
  ],
};
