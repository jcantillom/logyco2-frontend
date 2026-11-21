import { Directive, ElementRef, HostListener, inject } from '@angular/core';

/**
 * Cierra un `<dialog>` modal al hacer clic FUERA de él (en el fondo oscurecido). Para paneles de consulta; los formularios no la usan
 * para no perder lo escrito por un clic accidental.
 *
 * El clic en el fondo llega al propio `<dialog>` (los clics en su contenido llegan a los hijos); además se comprueban las coordenadas para
 * no cerrar por un clic en un hueco interno o por uno disparado con el teclado (coordenadas 0, 0).
 */
@Directive({ selector: 'dialog[appCloseOnBackdrop]' })
export class CloseOnBackdropDirective {
  private readonly dialog = inject<ElementRef<HTMLDialogElement>>(ElementRef).nativeElement;

  @HostListener('click', ['$event'])
  protected onClick(event: MouseEvent): void {
    if (event.target !== this.dialog || !this.dialog.open) return;

    const box = this.dialog.getBoundingClientRect();
    const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
    const fromKeyboard = event.clientX === 0 && event.clientY === 0;

    if (outside && !fromKeyboard) this.dialog.close();
  }
}
