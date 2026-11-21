import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PagerComponent, pageWindow } from './pager.component';

describe('pageWindow', () => {
  it('muestra todas las páginas cuando son pocas', () => {
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
  });

  it('abrevia con puntos suspensivos y conserva extremos y vecinas de la actual', () => {
    expect(pageWindow(1, 20)).toEqual([1, 2, null, 19, 20]);
    expect(pageWindow(10, 20)).toEqual([1, 2, null, 9, 10, 11, null, 19, 20]);
    expect(pageWindow(20, 20)).toEqual([1, 2, null, 19, 20]);
    expect(pageWindow(3, 20)).toEqual([1, 2, 3, 4, null, 19, 20]);
  });
});

@Component({
  imports: [PagerComponent],
  template: `<app-pager [page]="page()" [pageSize]="size()" [total]="total()" (pageChange)="page.set($event)" (sizeChange)="size.set($event)" />`,
})
class HostComponent {
  readonly page = signal(1);
  readonly size = signal(25);
  readonly total = signal(137);
}

describe('PagerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const host = (): HostComponent => fixture.componentInstance;
  const click = (selector: string): void => { el().querySelector<HTMLButtonElement>(selector)!.click(); fixture.detectChanges(); };

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
  });

  it('informa el rango visible y el total', () => {
    expect(el().querySelector('.info')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Mostrando 1–25 de 137');

    host().page.set(6);
    fixture.detectChanges();
    expect(el().querySelector('.info')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Mostrando 126–137 de 137');
  });

  it('avanza, retrocede y no sale de los límites', () => {
    expect(el().querySelector<HTMLButtonElement>('[data-testid=page-prev]')!.disabled).toBeTrue();

    click('[data-testid=page-next]');
    expect(host().page()).toBe(2);

    click('[data-testid=page-prev]');
    expect(host().page()).toBe(1);

    click('[aria-label="Última página"]');
    expect(host().page()).toBe(6);
    expect(el().querySelector<HTMLButtonElement>('[data-testid=page-next]')!.disabled).toBeTrue();
  });

  it('marca la página actual y permite saltar a otra', () => {
    expect(el().querySelector('[aria-current=page]')!.textContent!.trim()).toBe('1');

    click('[aria-label="Página 2"]');
    expect(host().page()).toBe(2);
  });

  it('cambia el tamaño de página', () => {
    const select = el().querySelector<HTMLSelectElement>('[data-testid=page-size]')!;
    select.value = '50';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();

    expect(host().size()).toBe(50);
  });

  it('no se muestra si no hay registros y oculta los botones si cabe en una página', () => {
    host().total.set(10);
    fixture.detectChanges();
    expect(el().querySelector('.nav')).toBeNull();
    expect(el().querySelector('.info')).not.toBeNull();

    host().total.set(0);
    fixture.detectChanges();
    expect(el().querySelector('[data-testid=pager]')).toBeNull();
  });
});
