import { TestBed } from '@angular/core/testing';
import { Route, Router } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { Observable, of } from 'rxjs';
import { buildSuperAdmin, buildUser, FAKE_TOKEN, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { routes } from '../../app.routes';
import { SessionStore } from '../../core/auth/session.store';
import { AuthToken, CurrentUser } from '../../domain/models/identity';
import { AuthRepository } from '../../domain/repositories/identity.repositories';

/** La guarda de la consola confirma el rol global con `/auth/me`: aquí responde con el SUPER_ADMIN de prueba. */
class FakeAuthRepository extends AuthRepository {
  login(): Observable<AuthToken> { return of(FAKE_TOKEN); }
  getCurrentUser(): Observable<CurrentUser> { return of(buildSuperAdmin()); }
}

/** Todas las rutas con ese `path` y con hijos, en cualquier nivel del árbol (la consola de plataforma también declara una `intelligence`). */
function findAll(list: readonly Route[], path: string): Route[] {
  return list.flatMap((route) => [...(route.path === path && route.children ? [route] : []), ...(route.children ? findAll(route.children, path) : [])]);
}

describe('rutas de LoGyCO₂ Intelligence en el espacio de la empresa', () => {
  // La de la empresa es la que declara su propio permiso; la de la consola se protege más arriba, con `platformMatch`.
  const intelligence = findAll(routes, 'intelligence').find((route) => route.canActivate !== undefined)!;

  it('el permiso `sector_reports:read` protege la vista general y los dos detalles (una sola vez, en la ruta padre)', () => {
    expect(intelligence).toBeDefined();
    expect(intelligence.canActivate?.length).toBe(1);
    expect(intelligence.children!.every((child) => child.canActivate === undefined)).toBeTrue();
  });

  it('la vista general y los detalles de energía y costos viven bajo `/intelligence`, sin salir a la consola', () => {
    const children = intelligence.children!;

    expect(children.map((child) => child.path)).toEqual(['', 'energia', 'costos', '**']);
    expect(children.find((c) => c.path === 'energia')!.data).toEqual({ section: 'energy', breadcrumb: 'Mercado energético' });
    expect(children.find((c) => c.path === 'costos')!.data).toEqual({ section: 'costs', breadcrumb: 'Costos de transporte' });
    expect(children.find((c) => c.path === '')!.pathMatch).toBe('full');
    expect(children.find((c) => c.path === '**')!.redirectTo).toBe('');
  });
});

/** Navegación real: los enlaces de la vista general no pueden llevar a un usuario de empresa a una pantalla que no puede abrir. */
describe('navegación a LoGyCO₂ Intelligence', () => {
  let harness: RouterTestingHarness;
  let router: Router;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: [...provideTestApp({ routes }), { provide: AuthRepository, useClass: FakeAuthRepository }] });
    harness = await RouterTestingHarness.create();
    router = TestBed.inject(Router);
  });

  it('un usuario de empresa con `sector_reports:read` abre el detalle de energía y el de costos dentro de su espacio', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));

    await harness.navigateByUrl('/intelligence/energia');
    expect(router.url).toBe('/intelligence/energia');
    expect(harness.routeNativeElement!.querySelector('[data-testid="section-title"]')!.textContent).toContain('Mercado energético');

    await harness.navigateByUrl('/intelligence/costos');
    expect(router.url).toBe('/intelligence/costos');
    expect(harness.routeNativeElement!.querySelector('[data-testid="section-title"]')!.textContent).toContain('Costos');
  });

  it('sin ningún permiso de empresa el acceso se rechaza', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, [])] }), TestBed.inject(SessionStore));

    await harness.navigateByUrl('/intelligence/energia');
    expect(router.url).toBe('/acceso-denegado');
  });

  it('la consola de plataforma sigue siendo solo para SUPER_ADMIN (por eso la vista general no enlaza a ella)', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/plataforma/intelligence/energia');
    expect(router.url).toBe('/acceso-denegado');

    TestBed.inject(SessionStore).clear();
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/plataforma/intelligence/energia');
    expect(router.url).toBe('/plataforma/intelligence/energia');
  });

  it('una dirección desconocida bajo `/intelligence` vuelve a la vista general', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));

    await harness.navigateByUrl('/intelligence/inexistente');
    expect(router.url).toBe('/intelligence');
  });
});
