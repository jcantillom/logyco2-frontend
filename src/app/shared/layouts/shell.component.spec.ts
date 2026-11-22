import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin, buildUser, membership, ORG_COORDINADORA, ORG_ENVIA } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { OrganizationContext } from '../../core/org/organization-context';
import { CurrentUser } from '../../domain/models/identity';
import { ShellComponent } from './shell.component';

describe('ShellComponent: navegación y visibilidad condicionada', () => {
  let fixture: ComponentFixture<ShellComponent>;

  function render(user: CurrentUser): HTMLElement {
    signInAs(user, TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(ShellComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const labels = (el: HTMLElement): string[] =>
    Array.from(el.querySelectorAll('nav a.nav-link .label')).map((n) => n.textContent?.trim() ?? '');

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [ShellComponent], providers: provideTestApp() });
  });

  it('ORG_ADMIN ve el menú agrupado del diseño: Inicio, Datos operativos, Huella de carbono, Resultados y Administración', () => {
    const el = render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
    expect(Array.from(el.querySelectorAll('.group h2')).map((h) => h.textContent!.trim())).toEqual([
      'Inicio', 'Datos operativos', 'Huella de carbono', 'Resultados', 'Administración',
    ]);
    expect(labels(el)).toEqual([
      'Resumen', 'Mis vehículos', 'Cargar información', 'Calidad de datos', 'Operaciones logísticas', 'Mis emisiones',
      'Análisis de emisiones', 'Plan de reducción', 'Reportes', 'Usuarios y accesos', 'Datos de mi empresa',
    ]);
    expect(el.querySelector('.side-foot .help')!.textContent).toContain('Ayuda y soporte');
  });

  it('no incluye inteligencia de mercado, conciliación, evidencias ni la configuración (ésta vive en el menú de usuario)', () => {
    const visible = labels(render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] })));
    ['Mercado y costos', 'Conciliación', 'Evidencias', 'Configuración', 'Empresas', 'Superadministradores'].forEach((x) => expect(visible).not.toContain(x));
  });

  it('muestra la empresa activa y el rol bajo el logo', () => {
    const el = render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
    expect(el.querySelector('.company')!.textContent).toContain('ENVIA');
    expect(el.querySelector('.company')!.textContent).toContain('Administrador de empresa');
    expect(el.querySelector('.company .chev')).toBeNull(); // una sola empresa: no hay nada que elegir
  });

  it('«Datos de mi empresa» lleva a la vista de la empresa activa', () => {
    const el = render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN'])] }));
    const link = Array.from(el.querySelectorAll('nav a.nav-link')).find((a) => a.textContent!.includes('Datos de mi empresa'))!;
    expect(link.getAttribute('href')).toBe('/mi-empresa');
  });

  it('con varias empresas el bloque despliega la lista y cambia la empresa activa', () => {
    const el = render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['ORG_VIEWER'])] }));
    el.querySelector<HTMLButtonElement>('.company-btn')!.click();
    fixture.detectChanges();
    expect(el.querySelectorAll('.company-list [role=option]').length).toBe(2);

    (el.querySelectorAll<HTMLButtonElement>('.company-list [role=option]')[1]).click();
    fixture.detectChanges();

    expect(TestBed.inject(OrganizationContext).activeOrganizationId()).toBe(ORG_COORDINADORA.id);
    expect(el.querySelector('.company-list')).toBeNull();
    expect(el.querySelector('.company')!.textContent).toContain('Coordinadora');
  });

  it('«Mis vehículos» está en Datos operativos, es una pantalla real y lo ven ORG_ADMIN, ORG_ANALYST y ORG_VIEWER pero no el SUPER_ADMIN', () => {
    for (const role of ['ORG_ADMIN', 'ORG_ANALYST', 'ORG_VIEWER']) {
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ imports: [ShellComponent], providers: provideTestApp() });
      const el = render(buildUser({ memberships: [membership(ORG_ENVIA, [role])] }));
      const link = Array.from(el.querySelectorAll('nav a.nav-link')).find((a) => a.textContent!.includes('Mis vehículos'))!;

      expect(link).withContext(role).toBeTruthy();
      expect(link.getAttribute('href')).toBe('/vehiculos');
      expect(link.classList.contains('soon-item')).toBeFalse();
      expect(link.closest('.group')!.querySelector('h2')!.textContent!.trim()).toBe('Datos operativos');
    }

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ imports: [ShellComponent], providers: provideTestApp() });
    expect(labels(render(buildSuperAdmin()))).not.toContain('Mis vehículos');
  });

  it('ORG_VIEWER no ve usuarios ni carga de información', () => {
    const visible = labels(render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_VIEWER'])] })));
    expect(visible).toContain('Reportes');
    expect(visible).not.toContain('Usuarios y accesos');
    expect(visible).not.toContain('Cargar información');
  });

  it('GUILD_VIEWER (rol heredado) solo conserva el Resumen', () => {
    expect(labels(render(buildUser({ memberships: [membership(ORG_ENVIA, ['GUILD_VIEWER'])] })))).toEqual(['Resumen']);
  });

  it('el menú cambia al cambiar de empresa activa', () => {
    const el = render(buildUser({ memberships: [membership(ORG_ENVIA, ['ORG_ADMIN']), membership(ORG_COORDINADORA, ['GUILD_VIEWER'])] }));
    expect(labels(el)).toContain('Cargar información');

    TestBed.inject(OrganizationContext).select(ORG_COORDINADORA.id);
    fixture.detectChanges();

    expect(labels(el)).toEqual(['Resumen']);
  });

  it('atenúa y rotula «Próximamente» lo que no tiene backend', () => {
    const el = render(buildUser());
    const upload = (): Element => Array.from(el.querySelectorAll('nav a.nav-link')).find((a) => a.textContent!.includes('Cargar información'))!;
    expect(upload().classList.contains('soon-item')).toBeTrue();
    expect(upload().getAttribute('title')).toBe('Próximamente');
    expect(el.querySelector('nav a.nav-link')!.classList.contains('soon-item')).toBeFalse(); // Resumen
    expect(upload().getAttribute('aria-label')).toBe('Cargar información · Próximamente');
    expect(upload().querySelector('.pill')!.textContent).toBe('Próximamente'); // etiqueta visible en el menú
    expect(el.querySelector('nav a.nav-link .pill')).not.toBeNull();
    expect(el.querySelector('nav a.nav-link')!.querySelector('.pill')).toBeNull(); // Resumen no la lleva
  });

  it('avisa cuando el acceso a la empresa activa se perdió', () => {
    const el = render(buildUser());
    expect(el.querySelector('[data-testid="access-lost"]')).toBeNull();

    TestBed.inject(OrganizationContext).markAccessLost(ORG_ENVIA.id);
    fixture.detectChanges();

    expect(el.querySelector('[data-testid="access-lost"]')).not.toBeNull();
  });

  it('el sidebar es colapsable', () => {
    const el = render(buildUser());
    const button = el.querySelector<HTMLButtonElement>('.collapse-btn')!;
    expect(el.querySelector('.shell')?.classList.contains('collapsed')).toBeFalse();

    button.click();
    fixture.detectChanges();

    expect(el.querySelector('.shell')?.classList.contains('collapsed')).toBeTrue();
    expect(button.getAttribute('aria-expanded')).toBe('false');
  });
});
