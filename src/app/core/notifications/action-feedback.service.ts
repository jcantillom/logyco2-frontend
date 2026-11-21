import { Injectable, signal } from '@angular/core';

export type ActionFeedbackState =
  | { readonly phase: 'working'; readonly label: string }
  | { readonly phase: 'done'; readonly message: string };

/** El camión se ve al menos este tiempo aunque la acción responda enseguida (si no, parpadea y no se aprecia). */
export const MIN_WORKING_MS = 2200;
/** Tiempo que permanece el check con el mensaje de éxito. */
export const DONE_VISIBLE_MS = 3200;

/** Estado del aviso de acciones: camión mientras se ejecuta y confirmación al terminar. */
@Injectable({ providedIn: 'root' })
export class ActionFeedbackService {
  private readonly current = signal<ActionFeedbackState | null>(null);
  private timer: ReturnType<typeof setTimeout> | null = null;
  private startedAt = 0;

  readonly state = this.current.asReadonly();

  start(label: string): void {
    this.clearTimer();
    this.startedAt = Date.now();
    this.current.set({ phase: 'working', label });
  }

  finish(message: string): void {
    this.clearTimer();
    const remaining = Math.max(0, MIN_WORKING_MS - (Date.now() - this.startedAt));
    const show = (): void => {
      this.current.set({ phase: 'done', message });
      this.timer = setTimeout(() => this.close(), DONE_VISIBLE_MS);
    };

    if (remaining === 0 || this.current()?.phase !== 'working') show();
    else this.timer = setTimeout(show, remaining);
  }

  /** Cierra sin mensaje (el error se avisa aparte con un toast). */
  close(): void {
    this.clearTimer();
    this.current.set(null);
  }

  private clearTimer(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
  }
}
