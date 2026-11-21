import { HttpTestingController } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTestApp } from '../../../testing/providers';
import { OrgLogoComponent } from './org-logo.component';

const API = 'http://api.test/api/v1';
const ID = '11111111-1111-4111-8111-111111111111';
const png = (): Blob => new Blob([new Uint8Array(8)], { type: 'image/png' });

@Component({
  imports: [OrgLogoComponent],
  template: `<span class="box"><app-org-logo [id]="id" [version]="version()">EN</app-org-logo></span>`,
})
class HostComponent {
  id = ID;
  version = signal<string | null>(null);
}

describe('OrgLogoComponent: logo de una empresa con versión', () => {
  let http: HttpTestingController;

  function render() {
    TestBed.configureTestingModule({ imports: [HostComponent], providers: provideTestApp() });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();

    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('sin versión (la empresa no tiene logo) muestra las iniciales y no pide nada', () => {
    const { el } = render();

    expect(el.textContent).toContain('EN');
    expect(el.querySelector('img')).toBeNull();
    http.expectNone(`${API}/organizations/${ID}/logo`);
  });

  it('con versión pide la imagen y la muestra; mientras llega se ven las iniciales', async () => {
    const { fixture, el } = render();

    fixture.componentInstance.version.set('abc123');
    fixture.detectChanges();
    await fixture.whenStable();
    expect(el.textContent).toContain('EN');

    http.expectOne(`${API}/organizations/${ID}/logo`).flush(png());
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('img')!.src.startsWith('blob:')).toBeTrue();
    expect(el.textContent).not.toContain('EN');
  });

  it('la misma versión no se vuelve a pedir y una versión nueva sí', async () => {
    const first = render();
    first.fixture.componentInstance.version.set('v1');
    first.fixture.detectChanges();
    await first.fixture.whenStable();
    http.expectOne(`${API}/organizations/${ID}/logo`).flush(png());
    await first.fixture.whenStable();

    first.fixture.componentInstance.version.set('v2'); // el administrador cambió el logo
    first.fixture.detectChanges();
    await first.fixture.whenStable();
    http.expectOne(`${API}/organizations/${ID}/logo`).flush(png());

    first.fixture.componentInstance.version.set('v2'); // sin cambios
    first.fixture.detectChanges();
    await first.fixture.whenStable();
    http.expectNone(`${API}/organizations/${ID}/logo`);
  });

  it('si la imagen no se puede pedir se quedan las iniciales (sin error en pantalla)', async () => {
    const { fixture, el } = render();

    fixture.componentInstance.version.set('abc123');
    fixture.detectChanges();
    await fixture.whenStable();
    http.expectOne(`${API}/organizations/${ID}/logo`).flush(new Blob(['error']), { status: 500, statusText: 'Server Error' });
    await fixture.whenStable();
    fixture.detectChanges();

    expect(el.querySelector('img')).toBeNull();
    expect(el.textContent).toContain('EN');
  });
});
