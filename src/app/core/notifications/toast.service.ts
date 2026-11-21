import { Injectable, signal } from '@angular/core';
import { AppError } from '../errors/app-error';

export type ToastKind = 'success' | 'info' | 'warning' | 'error';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  readonly message: string;
  readonly requestId: string | null;
}

@Injectable({ providedIn: 'root' })
export class ToastService {
  private readonly items = signal<readonly Toast[]>([]);
  private nextId = 1;

  readonly toasts = this.items.asReadonly();

  success(message: string): void {
    this.push('success', message, null, 4000);
  }

  info(message: string): void {
    this.push('info', message, null, 5000);
  }

  warning(message: string): void {
    this.push('warning', message, null, 6000);
  }

  error(error: AppError | string): void {
    if (typeof error === 'string') this.push('error', error, null, 8000);
    else this.push('error', error.message, error.requestId, 8000);
  }

  dismiss(id: number): void {
    this.items.update((current) => current.filter((toast) => toast.id !== id));
  }

  private push(kind: ToastKind, message: string, requestId: string | null, ttlMs: number): void {
    const id = this.nextId++;
    this.items.update((current) => [...current, { id, kind, message, requestId }]);
    setTimeout(() => this.dismiss(id), ttlMs);
  }
}
