import { HttpTestingController } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { ConfirmService } from '../../core/notifications/confirm.service';
import { PlatformUserDetailComponent } from './platform-user-detail.component';

const API = 'http://api.test/api/v1';
const ORG = '33333333-3333-4333-8333-333333333333';
const pag = { page: 1, page_size: 25, total: 1, total_pages: 1, has_next: false, has_previous: false };

describe('PlatformUserDetailComponent', () => {
  let fixture: ComponentFixture<PlatformUserDetailComponent>;
  let http: HttpTestingController;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [PlatformUserDetailComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    fixture = TestBed.createComponent(PlatformUserDetailComponent);
    fixture.componentRef.setInput('id', 'u1');
    fixture.detectChanges();
    http.expectOne(`${API}/users/u1`).flush({ data: {
      id: 'u1', full_name: 'Luis Gómez', email: 'luis@x.co', is_active: true, global_roles: [],
      memberships: [
        { membership_id: 'm-1', organization: { id: ORG, name: 'ENVIA' }, status: 'PENDING', roles: ['ORG_ANALYST'] },
        { membership_id: 'm-2', organization: { id: 'o2', name: 'OTRA' }, status: 'REVOKED', roles: ['ORG_VIEWER'] },
      ],
    }, meta: { pagination: pag } });
    fixture.detectChanges();
  });
  it('muestra el perfil sin textos técnicos de contrato', () => {
    const text = el().textContent!;
    expect(text).toContain('Luis Gómez');
    expect(text).toContain('luis@x.co');
    expect(el().querySelector('[data-testid=user-status]')!.textContent).toContain('Activo');
    expect(text).not.toContain('GET /users');
    expect(text).not.toContain('contrato pendiente');
    expect(text).not.toContain('REAL');
  });

  it('la identidad muestra su única empresa y su tipo de usuario', () => {
    expect(el().querySelector('[data-testid=user-company]')!.textContent).toContain('ENVIA');
    expect(el().querySelector('.chips')!.textContent).toContain('Analista');
  });

  it('la tabla muestra la membresía vigente y la anterior se marca como historia', () => {
    const rows = Array.from(el().querySelectorAll('tbody tr')).map((r) => r.textContent!.replace(/\s+/g, ' '));
    expect(rows[0]).toContain('ENVIA');
    expect(rows[0]).toContain('Pendiente de aprobación');
    expect(rows[1]).toContain('anterior');
    expect(rows[1]).toContain('Revocada');
  });

  it('aprobar pide confirmación y envía ACTIVE; cancelar no envía nada', async () => {
    const approve = Array.from(el().querySelectorAll<HTMLButtonElement>('tbody .btn')).find((b) => b.textContent!.trim() === 'Aprobar')!;
    approve.click();
    TestBed.inject(ConfirmService).pending()!.resolve(false);
    await fixture.whenStable();
    expect(http.match((r) => r.method === 'PATCH').length).toBe(0);

    approve.click();
    TestBed.inject(ConfirmService).pending()!.resolve(true);
    await fixture.whenStable();
    const patch = http.expectOne(`${API}/organizations/${ORG}/memberships/m-1`);
    expect(patch.request.body).toEqual({ status: 'ACTIVE' });
  });
});
