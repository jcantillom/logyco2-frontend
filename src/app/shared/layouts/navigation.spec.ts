import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, Routes } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { buildUser, membership, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { authGuard, permissionGuard } from '../../core/guards/auth.guards';
import { BreadcrumbsComponent } from './breadcrumbs.component';

@Component({ template: '<p id="page">página</p>' })
class PageComponent {}

@Component({ imports: [RouterOutlet, BreadcrumbsComponent], template: '<app-breadcrumbs /><router-outlet />' })
class LayoutComponent {}

const routes: Routes = [
  { path: 'login', component: PageComponent },
  {
    path: '',
    component: LayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: 'resumen', component: PageComponent, data: { breadcrumb: 'Resumen' } },
      {
        path: 'organizaciones',
        data: { breadcrumb: 'Empresas' },
        canActivate: [permissionGuard('organizations:read')],
        children: [{ path: ':id', component: PageComponent, data: { breadcrumb: 'Detalle' } }],
      },
      { path: 'cargas', component: PageComponent, data: { breadcrumb: 'Carga de archivos' }, canActivate: [permissionGuard('imports:create')] },
      { path: 'acceso-denegado', component: PageComponent, data: { breadcrumb: 'Acceso denegado' } },
      {
        path: 'zona',
        data: { breadcrumb: 'Zona' },
        children: [{ path: '', component: PageComponent }, { path: ':id', component: PageComponent, data: { breadcrumb: 'Detalle' } }],
      },
    ],
  },
];

describe('navegación, guards y breadcrumbs', () => {
  let harness: RouterTestingHarness;

  beforeEach(async () => {
    TestBed.configureTestingModule({ providers: provideTestApp({ routes }) });
    harness = await RouterTestingHarness.create();
  });

  it('sin sesión, una ruta protegida redirige a /login', async () => {
    await harness.navigateByUrl('/resumen');
    expect(TestBed.inject(Router).url).toContain('/login');
  });

  it('con sesión navega y construye las migas desde data.breadcrumb', async () => {
    signInAs(buildUser(), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/organizaciones/abc');
    harness.detectChanges();

    const crumbs = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('app-breadcrumbs li')).map((li) => li.textContent?.trim());
    expect(crumbs).toEqual(['LoGyCO₂', 'Empresas', 'Detalle']);
    expect((harness.routeNativeElement as HTMLElement).querySelector('[aria-current="page"]')?.textContent).toBe('Detalle');
  });

  it('un permiso faltante lleva a /acceso-denegado', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] }), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/cargas');
    expect(TestBed.inject(Router).url).toBe('/acceso-denegado');
  });

  it('con el permiso, la ruta se activa', async () => {
    signInAs(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ANALYST'])] }), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/cargas');
    expect(TestBed.inject(Router).url).toBe('/cargas');
  });

  it('una ruta hija vacía que hereda data del padre no duplica la miga', async () => {
    signInAs(buildUser(), TestBed.inject(SessionStore));
    await harness.navigateByUrl('/zona');
    harness.detectChanges();
    const crumbs = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('app-breadcrumbs li')).map((li) => li.textContent?.trim());
    expect(crumbs).toEqual(['LoGyCO₂', 'Zona']);

    await harness.navigateByUrl('/zona/42');
    harness.detectChanges();
    const detail = Array.from((harness.routeNativeElement as HTMLElement).querySelectorAll('app-breadcrumbs li')).map((li) => li.textContent?.trim());
    expect(detail).toEqual(['LoGyCO₂', 'Zona', 'Detalle']);
  });
});
