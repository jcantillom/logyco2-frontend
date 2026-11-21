import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppError } from '../../core/errors/app-error';
import { ResourceStatus } from '../../core/org/scoped-resource';
import { ResourceStateComponent } from './resource-state.component';

@Component({
  imports: [ResourceStateComponent],
  template: `
    <app-resource-state [status]="status()" [error]="error()" [empty]="empty()" [emptyIcon]="icon()" emptyTitle="Nada aquí" (retry)="retried = retried + 1">
      <p id="content">contenido</p>
    </app-resource-state>
  `,
})
class HostComponent {
  status = signal<ResourceStatus>('loading');
  error = signal<AppError | null>(null);
  empty = signal(false);
  icon = signal<string | null>(null);
  retried = 0;
}

describe('ResourceStateComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    const set = (status: ResourceStatus, error: AppError | null = null, empty = false): void => {
      fixture.componentInstance.status.set(status);
      fixture.componentInstance.error.set(error);
      fixture.componentInstance.empty.set(empty);
      fixture.detectChanges();
    };
    return { fixture, el, set };
  }

  it('vacío: dibuja el ícono solo cuando se le pasa uno', () => {
    const { fixture, el, set } = setup();
    set('ready', null, true);

    expect(el.querySelector('.empty-ico')).toBeNull();
    expect(el.textContent).toContain('Nada aquí');

    fixture.componentInstance.icon.set('M12 3v18');
    fixture.detectChanges();

    expect(el.querySelector('.empty-ico path')!.getAttribute('d')).toBe('M12 3v18');
    expect(el.querySelector('.empty-ico')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('cargando: muestra skeleton accesible y oculta el contenido', () => {
    const { el } = setup();
    expect(el.querySelector('[role="status"][aria-busy="true"]')).not.toBeNull();
    expect(el.querySelector('#content')).toBeNull();
  });

  it('idle se comporta como cargando', () => {
    const { el, set } = setup();
    set('idle');
    expect(el.querySelector('.skeleton')).not.toBeNull();
  });

  it('error: muestra mensaje, identificador de solicitud y permite reintentar', () => {
    const { fixture, el, set } = setup();
    set('error', new AppError('server', 'INTERNAL_ERROR', 500, 'Ocurrió un error interno.', 'req-777'));

    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Ocurrió un error interno.');
    expect(el.textContent).toContain('req-777');

    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.retried).toBe(1);
  });

  it('vacío: muestra el estado vacío con el título indicado', () => {
    const { el, set } = setup();
    set('ready', null, true);
    expect(el.textContent).toContain('Nada aquí');
    expect(el.querySelector('#content')).toBeNull();
  });

  it('listo con datos: proyecta el contenido', () => {
    const { el, set } = setup();
    set('ready');
    expect(el.querySelector('#content')?.textContent).toBe('contenido');
  });
});
