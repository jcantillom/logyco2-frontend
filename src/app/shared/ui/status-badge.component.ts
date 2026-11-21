import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { Label, Tone } from './labels';

@Component({
  selector: 'app-status-badge',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge-' + toneClass()">{{ label().text }}</span>`,
})
export class StatusBadgeComponent {
  readonly label = input.required<Label>();

  protected readonly toneClass = computed<Tone>(() => this.label().tone);
}
