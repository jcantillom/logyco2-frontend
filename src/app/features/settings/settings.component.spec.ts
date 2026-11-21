import { ActivatedRoute } from '@angular/router';
import { TestBed } from '@angular/core/testing';
import { buildSuperAdmin } from '../../../testing/builders';
import { provideTestApp, signInAs } from '../../../testing/providers';
import { SessionStore } from '../../core/auth/session.store';
import { SettingsComponent } from './settings.component';

describe('Configuración', () => {
  function render(platform: boolean): HTMLElement {
    TestBed.configureTestingModule({
      imports: [SettingsComponent],
      providers: [...provideTestApp(), { provide: ActivatedRoute, useValue: { snapshot: { data: { platform } } } }],
    });
    signInAs(buildSuperAdmin(), TestBed.inject(SessionStore));
    const fixture = TestBed.createComponent(SettingsComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('en la consola de plataforma solo muestra la cuenta (sin empresas)', () => {
    const el = render(true);
    expect(el.querySelector('#prof')?.textContent).toContain('Mi cuenta');
    expect(el.querySelector('#orgs')).toBeNull();
    expect(el.textContent).not.toContain('No perteneces a ninguna empresa');
  });

  it('en el espacio de empresa conserva sus empresas', () => {
    const el = render(false);
    expect(el.querySelector('#orgs')).not.toBeNull();
  });
});
