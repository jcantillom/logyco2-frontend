import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

/** Capacidad prevista del menú que aún no existe: explica qué ofrecerá, sin cifras ni datos de ejemplo. */
@Component({
  selector: 'app-coming-soon',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="page">
      <header class="page-header">
        <div>
          <h1>{{ title }}</h1>
          <p>Esta capacidad todavía no está habilitada.</p>
        </div>
        <span class="badge">Próximamente</span>
      </header>
      <section class="card stack" data-testid="coming-soon">
        <h2>Qué ofrecerá</h2>
        <p>{{ description }}</p>
        <p class="muted small">Cuando esté lista se habilitará aquí, en este mismo lugar del menú.</p>
        <div><a class="btn btn-secondary" routerLink="/resumen">Volver al resumen</a></div>
      </section>
    </div>
  `,
})
export class ComingSoonComponent {
  private readonly data = inject(ActivatedRoute).snapshot.data;
  protected readonly title: string = this.data['title'] ?? this.data['breadcrumb'] ?? '';
  protected readonly description: string = this.data['description'] ?? '';
}
