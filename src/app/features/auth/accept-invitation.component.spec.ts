import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, throwError } from 'rxjs';
import { buildUser } from '../../../testing/builders';
import { provideTestApp } from '../../../testing/providers';
import { AuthFacade } from '../../core/auth/auth.facade';
import { AppError } from '../../core/errors/app-error';
import { InvitationsRepository } from '../../domain/repositories/identity.repositories';
import { SuperAdminsRepository } from '../../domain/repositories/platform-admin.repositories';
import { AcceptInvitationComponent } from './accept-invitation.component';

describe('AcceptInvitationComponent: invitaciones de empresa y de superadministrador', () => {
  let fixture: ComponentFixture<AcceptInvitationComponent>;
  let org: { accept: jasmine.Spy };
  let platform: { accept: jasmine.Spy };
  let router: Router;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;

  function setup(): void {
    org = { accept: jasmine.createSpy('org').and.returnValue(of({})) };
    platform = { accept: jasmine.createSpy('platform').and.returnValue(of({ userId: 'u1', roleCode: 'SUPER_ADMIN', alreadyMember: false })) };
    TestBed.configureTestingModule({
      imports: [AcceptInvitationComponent],
      providers: [...provideTestApp(), { provide: InvitationsRepository, useValue: org }, { provide: SuperAdminsRepository, useValue: platform }],
    });
    spyOn(TestBed.inject(AuthFacade), 'refreshUser').and.returnValue(of(buildUser()));
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
    fixture = TestBed.createComponent(AcceptInvitationComponent);
    fixture.detectChanges();
  }
  function submit(code: string): void {
    const input = el().querySelector<HTMLInputElement>('#code')!;
    input.value = code; input.dispatchEvent(new Event('input'));
    el().querySelector<HTMLButtonElement>('[data-testid="accept-submit"]')!.click();
    fixture.detectChanges();
  }

  it('un código de invitación de empresa usa el flujo de membresía y entra al espacio de empresa', () => {
    setup();
    submit('A'.repeat(43));

    expect(org.accept).toHaveBeenCalledOnceWith('A'.repeat(43));
    expect(platform.accept).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/resumen']);
    expect(el().querySelector('[data-testid="accepted"]')!.textContent).toContain('pendiente de aprobación');
  });

  it('un código «sa_…» usa el flujo de superadministrador y entra a la consola de plataforma', () => {
    setup();
    submit('sa_' + 'B'.repeat(43));

    expect(platform.accept).toHaveBeenCalledOnceWith('sa_' + 'B'.repeat(43));
    expect(org.accept).not.toHaveBeenCalled();
    expect(router.navigate).toHaveBeenCalledWith(['/plataforma']);
    expect(el().querySelector('[data-testid="accepted"]')!.textContent).toContain('superadministrador');
  });

  it('si el servidor rechaza el código muestra el mensaje del catálogo y no navega', () => {
    setup();
    platform.accept.and.returnValue(throwError(() => new AppError('forbidden', 'IDENTITY_NOT_VERIFIED', 403, 'No fue posible verificar que tu identidad corresponda a la persona invitada.')));
    submit('sa_' + 'C'.repeat(43));

    expect(el().querySelector('[role="alert"]')!.textContent).toContain('No fue posible verificar');
    expect(router.navigate).not.toHaveBeenCalled();
  });

  it('el código no se muestra en pantalla mientras se escribe (campo de contraseña)', () => {
    setup();

    expect(el().querySelector<HTMLInputElement>('#code')!.type).toBe('password');
  });
});
