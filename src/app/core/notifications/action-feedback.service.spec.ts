import { fakeAsync, tick } from '@angular/core/testing';
import { ActionFeedbackService, DONE_VISIBLE_MS, MIN_WORKING_MS } from './action-feedback.service';

describe('ActionFeedbackService', () => {
  it('mantiene el camión el tiempo mínimo aunque la acción termine al instante', fakeAsync(() => {
    const feedback = new ActionFeedbackService();

    feedback.start('Creando empresa…');
    feedback.finish('Empresa creada');
    tick(MIN_WORKING_MS - 1);
    expect(feedback.state()?.phase).toBe('working');

    tick(1);
    expect(feedback.state()).toEqual({ phase: 'done', message: 'Empresa creada' });

    tick(DONE_VISIBLE_MS);
    expect(feedback.state()).toBeNull();
  }));

  it('muestra el éxito sin esperar si la acción ya tardó más que el mínimo', fakeAsync(() => {
    const feedback = new ActionFeedbackService();

    feedback.start('Eliminando…');
    tick(MIN_WORKING_MS + 500);
    feedback.finish('Eliminada');

    expect(feedback.state()?.phase).toBe('done');
    tick(DONE_VISIBLE_MS);
  }));

  it('cierra de inmediato ante un error y no deja un éxito pendiente', fakeAsync(() => {
    const feedback = new ActionFeedbackService();

    feedback.start('Creando…');
    feedback.close();
    tick(MIN_WORKING_MS + DONE_VISIBLE_MS);

    expect(feedback.state()).toBeNull();
  }));
});
