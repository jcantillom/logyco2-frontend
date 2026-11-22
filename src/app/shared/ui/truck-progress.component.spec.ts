import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TruckProgressComponent } from './truck-progress.component';

describe('TruckProgressComponent', () => {
  let fixture: ComponentFixture<TruckProgressComponent>;
  const bar = (): HTMLElement => (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>('[role="progressbar"]')!;

  function render(percent: number | null, label = 'Avance de la revisión'): void {
    TestBed.configureTestingModule({ imports: [TruckProgressComponent] });
    fixture = TestBed.createComponent(TruckProgressComponent);
    fixture.componentRef.setInput('percent', percent);
    fixture.componentRef.setInput('label', label);
    fixture.detectChanges();
  }

  it('con porcentaje expone el avance y mueve el camión con la barra', () => {
    render(40);

    expect(bar().getAttribute('aria-valuenow')).toBe('40');
    expect(bar().getAttribute('aria-label')).toBe('Avance de la revisión');
    expect(bar().style.getPropertyValue('--p')).toBe('0.4');
    expect(bar().classList).not.toContain('loop');
  });

  it('sin porcentaje recorre la carretera en bucle y no declara un valor', () => {
    render(null);

    expect(bar().classList).toContain('loop');
    expect(bar().hasAttribute('aria-valuenow')).toBeFalse();
  });

  it('el tamaño `sm` es compacto y por defecto es el normal', () => {
    render(40);
    expect(bar().classList).not.toContain('sm');

    fixture.componentRef.setInput('size', 'sm');
    fixture.detectChanges();
    expect(bar().classList).toContain('sm');
    expect(bar().getAttribute('aria-valuenow')).toBe('40');
  });

  it('acota el avance entre 0 y 100', () => {
    render(250);
    expect(bar().style.getPropertyValue('--p')).toBe('1');

    fixture.componentRef.setInput('percent', -5);
    fixture.detectChanges();
    expect(bar().style.getPropertyValue('--p')).toBe('0');
  });

  it('el camión es decorativo para los lectores de pantalla', () => {
    render(10);

    expect((fixture.nativeElement as HTMLElement).querySelector('.truck')!.getAttribute('aria-hidden')).toBe('true');
  });
});
