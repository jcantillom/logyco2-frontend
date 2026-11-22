import { Component } from '@angular/core';
import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { routes } from '../../app.routes';
import { PLATFORM_ROUTES } from '../platform/platform.routes';
import { SessionStore } from '../../core/auth/session.store';
import { permissionGuard } from '../../core/guards/auth.guards';
import { ShellComponent } from '../../shared/layouts/shell.component';
import { catalogDto, fuelsDto } from './emissions.fixtures';
import { EmissionsComponent } from './emissions.component';

@Component({ template: '<p id="denied">Acceso denegado</p>' })
class DeniedComponent {}

describe('«Cálculo de emisiones» en el espacio de empresa', () => {
  const company = routes.find((r) => r.component === ShellComponent)!.children!.find((r) => r.path === 'calculo-emisiones')!;

  it('la ruta de la empresa usa la misma pantalla, con migas, ancho y «cabe en una pantalla», y exige organizations:manage', async () => {
    expect(company.data).toEqual({ breadcrumb: 'Cálculo de emisiones', wide: true, fit: true });
    expect(company.canActivate!.length).toBe(1);
    expect(await company.loadComponent!()).toBe(EmissionsComponent);
  });

  it('la consola conserva su propia ruta /plataforma/calculo-emisiones con la misma pantalla', async () => {
    const platform = PLATFORM_ROUTES.find((r) => r.path === 'calculo-emisiones')!;

    expect(await platform.loadComponent!()).toBe(EmissionsComponent);
  });

  describe('con la guarda real', () => {
    const testRoutes: Routes = [
      { path: 'calculo-emisiones', data: company.data, canActivate: [permissionGuard('organizations:manage')], component: EmissionsComponent },
      { path: 'acceso-denegado', component: DeniedComponent },
    ];

    function setup(role: string): void {
      TestBed.configureTestingModule({ providers: provideTestApp({ routes: testRoutes }) });
      signInAs(buildUser({ memberships: [membership(ORG_ENVIA, [role])] }), TestBed.inject(SessionStore));
    }

    it('ORG_ADMIN abre la guía y se piden el catálogo y los combustibles al servidor', async () => {
      setup('ORG_ADMIN');
      const harness = await RouterTestingHarness.create();
      const http = TestBed.inject(HttpTestingController);

      await harness.navigateByUrl('/calculo-emisiones');
      http.expectOne('http://api.test/api/v1/emissions/vehicles').flush({ data: catalogDto() });
      http.match('http://api.test/api/v1/emissions/reference/fuels').forEach((r) => r.flush({ data: fuelsDto() }));
      harness.detectChanges();

      expect(TestBed.inject(Router).url).toBe('/calculo-emisiones');
      expect((harness.routeNativeElement as HTMLElement).querySelector('h1')!.textContent).toBe('Guía de cálculo y vehículos de carga');
    });

    it('ORG_ANALYST, ORG_VIEWER y GUILD_VIEWER terminan en «acceso denegado» con la URL directa', async () => {
      for (const role of ['ORG_ANALYST', 'ORG_VIEWER', 'GUILD_VIEWER']) {
        TestBed.resetTestingModule();
        setup(role);
        const harness = await RouterTestingHarness.create();

        await harness.navigateByUrl('/calculo-emisiones');

        expect(TestBed.inject(Router).url).withContext(role).toBe('/acceso-denegado');
        TestBed.inject(HttpTestingController).expectNone('http://api.test/api/v1/emissions/vehicles');
      }
    });
  });

  it('el shell marca «fit» (cabe en una pantalla) solo en las rutas que lo piden', async () => {
    @Component({ template: '<p>x</p>' })
    class Page {}

    TestBed.configureTestingModule({
      providers: provideTestApp({ routes: [{ path: '', component: ShellComponent, children: [{ path: 'uno', data: { fit: true }, component: Page }, { path: 'dos', component: Page }] }] }),
    });
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }), TestBed.inject(SessionStore));
    const harness = await RouterTestingHarness.create();

    await harness.navigateByUrl('/uno', ShellComponent);
    harness.detectChanges();
    expect((harness.routeNativeElement as HTMLElement).querySelector('.shell')!.classList).toContain('fit');

    await harness.navigateByUrl('/dos');
    harness.detectChanges();
    expect((harness.routeNativeElement as HTMLElement).querySelector('.shell')!.classList).not.toContain('fit');
  });
});
