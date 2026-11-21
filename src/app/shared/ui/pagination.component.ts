import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Page } from '../../domain/models/pagination';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (page(); as p) {
      @if (p.totalPages > 1) {
        <nav class="row between" aria-label="Paginación">
          <span class="muted small" aria-live="polite">
            Página {{ p.page }} de {{ p.totalPages }} · {{ p.total }} registros
          </span>
          <span class="row">
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="!p.hasPrevious" (click)="pageChange.emit(p.page - 1)">
              Anterior
            </button>
            <button type="button" class="btn btn-secondary btn-sm" [disabled]="!p.hasNext" (click)="pageChange.emit(p.page + 1)">
              Siguiente
            </button>
          </span>
        </nav>
      }
    }
  `,
})
export class PaginationComponent {
  readonly page = input.required<Page<unknown> | null>();
  readonly pageChange = output<number>();
}
