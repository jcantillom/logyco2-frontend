import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CloseOnBackdropDirective } from './close-on-backdrop.directive';

@Component({
  imports: [CloseOnBackdropDirective],
  template: `<dialog appCloseOnBackdrop id="d" style="width: 300px; height: 200px; padding: 0"><button id="inside" type="button">Dentro</button></dialog>`,
})
class HostComponent {}

describe('CloseOnBackdropDirective', () => {
  function open(): HTMLDialogElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const dialog = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    document.body.appendChild(dialog); // el modal debe estar en el documento
    dialog.showModal();

    return dialog;
  }

  afterEach(() => document.querySelectorAll('dialog').forEach((d) => d.remove()));

  it('un clic en el fondo (fuera del cuadro) cierra el diálogo', () => {
    const dialog = open();

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 2, clientY: 2 }));

    expect(dialog.open).toBeFalse();
  });

  it('un clic en el contenido no lo cierra', () => {
    const dialog = open();

    dialog.querySelector<HTMLButtonElement>('#inside')!.click();

    expect(dialog.open).toBeTrue();
  });

  it('un clic sobre el propio cuadro (dentro de sus límites) no lo cierra', () => {
    const dialog = open();
    const box = dialog.getBoundingClientRect();

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: box.left + 10, clientY: box.top + 10 }));

    expect(dialog.open).toBeTrue();
  });

  it('un «clic» sin coordenadas (activado con el teclado) tampoco lo cierra', () => {
    const dialog = open();

    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 0, clientY: 0 }));

    expect(dialog.open).toBeTrue();
  });
});
