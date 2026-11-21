import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CursorPagerComponent } from './cursor-pager.component';

@Component({
  imports: [CursorPagerComponent],
  template: `<app-cursor-pager [from]="from" [to]="to" [totalLabel]="total" [pageSize]="size" [hasPrevious]="prev" [hasNext]="next" [busy]="busy" (previous)="log.push('previous')" (next)="log.push('next')" (sizeChange)="log.push('size:' + $event)" />`,
})
class HostComponent {
  from = 26; to = 50; total = '10.000+'; size = 25; prev = true; next = true; busy = false;
  log: string[] = [];
}

describe('CursorPagerComponent', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const button = (id: string): HTMLButtonElement => el().querySelector<HTMLButtonElement>(`[data-testid="${id}"]`)!;

  beforeEach(() => {
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('muestra el rango visible y el total, sin páginas numeradas', () => {
    expect(el().querySelector('.info')!.textContent).toContain('26–50');
    expect(el().querySelector('[data-testid="pager-total"]')!.textContent).toBe('10.000+');
    expect(el().querySelector('[aria-current="page"]')).toBeNull();
  });

  it('sin total conocido solo muestra el rango', () => {
    host.total = '';
    fixture.detectChanges();

    expect(el().querySelector('[data-testid="pager-total"]')).toBeNull();
  });

  it('emite anterior, siguiente y el tamaño elegido (25, 50 o 100)', () => {
    button('page-prev').click();
    button('page-next').click();
    const select = el().querySelector<HTMLSelectElement>('[data-testid="page-size"]')!;
    select.value = '100';
    select.dispatchEvent(new Event('change'));

    expect(host.log).toEqual(['previous', 'next', 'size:100']);
    expect([...select.options].map((o) => o.value)).toEqual(['25', '50', '100']);
  });

  it('desactiva «Anterior» en la primera página, «Siguiente» en la última y ambos mientras carga', () => {
    host.prev = false; host.next = false;
    fixture.detectChanges();
    expect([button('page-prev').disabled, button('page-next').disabled]).toEqual([true, true]);

    host.prev = true; host.next = true; host.busy = true;
    fixture.detectChanges();
    expect([button('page-prev').disabled, button('page-next').disabled]).toEqual([true, true]);

    host.busy = false;
    fixture.detectChanges();
    expect([button('page-prev').disabled, button('page-next').disabled]).toEqual([false, false]);
  });
});
