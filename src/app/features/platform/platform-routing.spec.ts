import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of, throwError } from 'rxjs';
import { buildSuperAdmin, buildUser, FAKE_TOKEN, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { routes } from '../../app.routes';
import { SessionStore } from '../../core/auth/session.store';
import { AppError } from '../../core/errors/app-error';
import { AuthToken, CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';

class FakeAuthRepository extends AuthRepository {
  me = jasmine.createSpy('me');
  login(): Observable<AuthToken> { return of(FAKE_TOKEN); }
  getCurrentUser(): Observable<CurrentUser> { return this.me(); }
}

/** Integración de rutas reales: el acceso a /plataforma depende SOLO del rol GLOBAL confirmado. */
describe('acceso a la consola de plataforma (rutas reales)', () => {
  let repo: FakeAuthRepository;
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    repo = new FakeAuthRepository();
    repo.me.and.returnValue(of(buildSuperAdmin()));
    TestBed.configureTestingModule({ providers: [...provideTestApp({ routes }), { provide: AuthRepository, useValue: repo }] });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it('sin sesión: redirige al login conservando la ruta solicitada', async () => {
    await harness.navigateByUrl('/plataforma/usuarios');
    expect(router.url).toBe('/login?returnUrl=%2Fplataforma%2Fusuarios');
  });

  it('un ORG_ADMIN que escribe la URL de la consola es rechazado (sin consultar siquiera el área)', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/plataforma/usuarios');
    expect(router.url).toBe('/acceso-denegado');
    expect(repo.me).not.toHaveBeenCalled();
  });

  it('la dirección antigua /plataforma/metricas redirige al resumen (no se rompen enlaces ni marcadores) y exige el mismo rol', async () => {
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/plataforma/metricas');
    expect(router.url).toBe('/plataforma/resumen');

    await TestBed.inject(Router).navigateByUrl('/');
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/plataforma/metricas');
    expect(router.url).toBe('/acceso-denegado');
  });

  it('un SUPER_ADMIN confirmado por /auth/me entra al resumen', async () => {
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/plataforma');
    expect(router.url).toBe('/plataforma/resumen');
    expect(repo.me).toHaveBeenCalledTimes(1);
    expect((harness.routeNativeElement as HTMLElement).querySelector('[data-testid="platform-context"]')).not.toBeNull();
  });

  it('si el rol local dice SUPER_ADMIN pero /auth/me falla, se deniega', async () => {
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    repo.me.and.returnValue(throwError(() => new AppError('network', 'HTTP_0', 0, 'x')));
    await harness.navigateByUrl('/plataforma/resumen');
    expect(router.url).toBe('/acceso-denegado');
  });

  it('si el servidor ya no informa el rol global, se deniega aunque la sesión local lo tuviera', async () => {
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    repo.me.and.returnValue(of(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] })));
    await harness.navigateByUrl('/plataforma/organizaciones');
    expect(router.url).toBe('/acceso-denegado');
  });

  it('el espacio de empresa sigue accesible para un ORG_ADMIN (contextos separados)', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/resumen');
    expect(router.url).toBe('/resumen');
  });

  describe('Herramientas complementarias (mercado y costos) y rutas retiradas', () => {
    const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;
    const navLabels = (): string[] => Array.from(root().querySelectorAll('nav a.nav-link .label')).map((n) => n.textContent!.trim());
    const toggle = (title: string): HTMLButtonElement => Array.from(root().querySelectorAll<HTMLButtonElement>('.group-toggle')).find((b) => b.textContent!.includes(title))!;
    const go = async (url: string): Promise<void> => {
      await harness.navigateByUrl(url);
      harness.detectChanges();
    };

    beforeEach(() => signInAs(buildSuperAdmin(), TestBed.inject(SessionStore)));

    it('mercado y costos viven en «Herramientas complementarias», desplegada por defecto (y se puede plegar), y no hay Intelligence como categoría principal', async () => {
      await go('/plataforma/resumen');

      expect(navLabels()).not.toContain('Mercado energético');
      expect(Array.from(root().querySelectorAll('.parent-toggle')).length).toBe(0);
      expect(toggle('Herramientas complementarias').getAttribute('aria-expanded')).toBe('true');
      expect(navLabels()).toEqual(jasmine.arrayContaining(['Referencias de combustibles', 'Indicadores de costos']));
      toggle('Herramientas complementarias').click();
      harness.detectChanges();
      expect(toggle('Herramientas complementarias').getAttribute('aria-expanded')).toBe('false');
      expect(navLabels()).not.toContain('Referencias de combustibles');
      expect(navLabels()).not.toContain('Inteligencia sectorial');
      expect(navLabels()).not.toContain('Sostenibilidad');
    });

    it('las URLs de mercado y costos abren su sección y despliegan el grupo', async () => {
      await go('/plataforma/intelligence/costos');

      expect(router.url).toBe('/plataforma/intelligence/costos');
      expect(root().querySelector('nav a.nav-link.active .label')!.textContent!.trim()).toBe('Indicadores de costos');
      expect(root().querySelector('app-intelligence h1')!.textContent!.trim()).toBe('Costos de transporte');
    });

    it('las rutas retiradas (sectorial, sostenibilidad, resumen) redirigen a mercado energético sin romper enlaces antiguos', async () => {
      for (const url of ['/plataforma/intelligence', '/plataforma/intelligence/sectorial', '/plataforma/intelligence/sostenibilidad', '/plataforma/intelligence/no-existe']) {
        await go(url);
        expect(router.url).toBe('/plataforma/intelligence/energia');
      }
    });

    it('la administración de fuentes sigue disponible en su ruta', async () => {
      await go('/plataforma/intelligence/fuentes');
      expect(router.url).toBe('/plataforma/intelligence/fuentes');
      expect(root().querySelector('app-intelligence-admin')).not.toBeNull();
    });

    it('«Estado de la plataforma» vive al pie del menú como categoría aparte', async () => {
      await go('/plataforma/estado');

      const pinned = root().querySelector('.group.pinned')!;
      expect(pinned.querySelector('h2')!.textContent!.trim()).toBe('Sistema');
      expect(Array.from(root().querySelectorAll('nav .group')).at(-1)).toBe(pinned);
    });

    it('los guards se conservan: un ORG_ADMIN no accede a ninguna subruta de Intelligence', async () => {
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
      await harness.navigateByUrl('/plataforma/intelligence/costos');
      expect(router.url).toBe('/acceso-denegado');
    });
  });
  describe('Guía de cálculo de emisiones (/plataforma/calculo-emisiones)', () => {
    const root = (): HTMLElement => harness.routeNativeElement as HTMLElement;

    it('un SUPER_ADMIN abre la guía, el menú la marca activa y la miga de pan la nombra', async () => {
      signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
      await harness.navigateByUrl('/plataforma/calculo-emisiones');
      harness.detectChanges();

      expect(router.url).toBe('/plataforma/calculo-emisiones');
      expect(root().querySelector('app-emissions h1')!.textContent!.trim()).toBe('Guía de cálculo y vehículos de carga');
      expect(root().querySelector('app-coming-soon')).toBeNull();
      expect(root().querySelector('nav a.nav-link.active .label')!.textContent!.trim()).toBe('Cálculo de emisiones');
      expect(root().querySelector('.crumbs')!.textContent).toContain('Cálculo de emisiones');
    });

    it('un ORG_ADMIN que escribe la URL es rechazado: la ruta es solo del SUPER_ADMIN', async () => {
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
      await harness.navigateByUrl('/plataforma/calculo-emisiones');

      expect(router.url).toBe('/acceso-denegado');
    });
  });
});
