import { ChangeDetectionStrategy, Component, ElementRef, computed, input, output, signal, viewChild } from '@angular/core';

export interface ComboOption {
  readonly key: string;
  readonly label: string;
  /** Segunda línea atenuada (p. ej. «Diésel · C3S3»). */
  readonly detail?: string | null;
  /** Marca corta junto a la opción (p. ej. «Inactivo»). */
  readonly tag?: string | null;
}

let nextId = 0;

/**
 * Combobox con búsqueda de texto (patrón «combobox con lista» de WAI-ARIA): el padre guarda el texto y las opciones que llegan del servidor; aquí solo se navega.
 * Flechas abren y mueven, `Enter` elige la opción activa (con la lista cerrada deja pasar el `Enter` al formulario), `Escape` cierra la lista sin cerrar el diálogo,
 * `Tab` cierra. La lista no tiene scroll: el padre limita cuántas opciones pide.
 */
@Component({
  selector: 'app-combobox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  styles: [
    `
      :host { position: relative; display: block; min-width: 0; }
      .input { width: 100%; box-sizing: border-box; min-height: 36px; padding-block: 4px; }
      .input[aria-invalid='true'] { border-color: var(--c-danger); }
      .list { position: absolute; z-index: 40; inset-inline: 0; top: calc(100% + 2px); display: grid; margin: 0; padding: 4px; list-style: none; border: 1px solid var(--c-bd); border-radius: 10px; background: var(--c-sf); box-shadow: 0 14px 38px color-mix(in srgb, var(--c-head) 20%, transparent); }
      .opt { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; padding: 5px 8px; border-radius: 7px; font-size: 0.84rem; color: var(--c-head); cursor: pointer; }
      .opt.on { background: color-mix(in srgb, var(--c-primary) 14%, var(--c-sf)); }
      .opt:hover { background: var(--c-row-hover); }
      .opt .main { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 650; }
      .opt small { flex: none; font-size: 0.72rem; color: var(--c-mu); }
      .opt .tag { padding: 0 6px; border-radius: 999px; background: var(--c-warning-bg); color: var(--c-warning); font-size: 0.68rem; font-weight: 700; }
      .note { padding: 6px 8px; font-size: 0.8rem; color: var(--c-mu); }
    `,
  ],
  template: `
    <input
      #field
      class="input"
      type="text"
      role="combobox"
      autocomplete="off"
      aria-autocomplete="list"
      [id]="inputId()"
      [attr.aria-label]="label() || null"
      [attr.aria-expanded]="expanded()"
      [attr.aria-controls]="listId"
      [attr.aria-activedescendant]="activeId()"
      [attr.aria-invalid]="invalid() ? 'true' : null"
      [attr.aria-describedby]="describedBy()"
      [attr.aria-required]="required() ? 'true' : null"
      [attr.placeholder]="placeholder() || null"
      [attr.maxlength]="maxLength()"
      [attr.data-testid]="testId()"
      [disabled]="disabled()"
      [value]="text()"
      (input)="onInput($event)"
      (focus)="onFocus()"
      (blur)="close()"
      (keydown)="onKey($event)"
    />
    @if (expanded()) {
      <ul class="list" role="listbox" [id]="listId" [attr.aria-label]="label() || null" (mousedown)="$event.preventDefault()">
        @for (o of options(); track o.key; let i = $index) {
          <li class="opt" role="option" [id]="optionId(i)" [class.on]="i === active()" [attr.aria-selected]="i === active()" tabindex="-1" data-testid="combo-option" (click)="choose(o)" (keydown.enter)="choose(o)">
            <span class="main">{{ o.label }}@if (o.tag) { {{ ' ' }}<span class="tag">{{ o.tag }}</span> }</span>
            @if (o.detail) { <small>{{ o.detail }}</small> }
          </li>
        }
        @if (options().length === 0) { <li class="note" role="presentation" data-testid="combo-empty">{{ loading() ? 'Buscando…' : emptyText() }}</li> }
      </ul>
    }
    <span class="sr-only" role="status" aria-live="polite" data-testid="combo-status">{{ status() }}</span>
  `,
})
export class ComboboxComponent {
  readonly inputId = input.required<string>();
  readonly label = input<string>('');
  readonly text = input('');
  readonly options = input<readonly ComboOption[]>([]);
  readonly loading = input(false);
  readonly invalid = input(false);
  readonly required = input(false);
  readonly disabled = input(false);
  readonly describedBy = input<string | null>(null);
  readonly placeholder = input<string>('');
  readonly emptyText = input('Sin resultados');
  readonly maxLength = input<number | null>(60);
  readonly testId = input<string | null>(null);

  /** El texto cambió por escritura (quita la selección anterior). */
  readonly typed = output<string>();
  /** Se enfocó el campo sin opciones a la vista: el padre puede pedir las primeras. */
  readonly opened = output<void>();
  readonly picked = output<string>();

  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  protected readonly listId = `combo-list-${nextId++}`;
  /** Lista desplegada por la persona (foco, escritura o flechas); se cierra con Escape, Tab, al elegir o al salir del campo. */
  private readonly shown = signal(false);
  protected readonly active = signal(0);
  protected readonly expanded = computed(() => this.shown() && !this.disabled());
  protected readonly activeId = computed(() => (this.expanded() && this.options().length > 0 ? this.optionId(Math.min(this.active(), this.options().length - 1)) : null));
  protected readonly status = computed(() => {
    if (!this.expanded()) return '';

    if (this.loading()) return 'Buscando…';

    const count = this.options().length;

    return count === 0 ? this.emptyText() : `${count} ${count === 1 ? 'resultado' : 'resultados'}`;
  });

  focus(): void {
    this.field().nativeElement.focus();
  }

  protected optionId(index: number): string {
    return `${this.listId}-${index}`;
  }

  protected onInput(event: Event): void {
    this.shown.set(true);
    this.active.set(0);
    this.typed.emit((event.target as HTMLInputElement).value);
  }

  protected onFocus(): void {
    this.shown.set(true);

    if (this.options().length === 0) this.opened.emit();
  }

  protected close(): void {
    this.shown.set(false);
  }

  protected choose(option: ComboOption): void {
    this.picked.emit(option.key);
    this.shown.set(false);
  }

  protected onKey(event: KeyboardEvent): void {
    const count = this.options().length;

    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        event.preventDefault();

        if (!this.shown()) return this.shown.set(true);

        if (count > 0) this.active.update((i) => (event.key === 'ArrowDown' ? (i + 1) % count : (i + count - 1) % count));

        return;
      }
      case 'Enter': {
        // Con la lista abierta y una opción activa, Enter elige; si no, sigue al formulario (guardar).
        if (this.expanded() && count > 0) {
          event.preventDefault();
          this.choose(this.options()[Math.min(this.active(), count - 1)]);
        }

        return;
      }
      case 'Escape': {
        // Escape cierra solo la lista; el diálogo se cierra con el siguiente.
        if (this.expanded()) {
          event.preventDefault();
          event.stopPropagation();
          this.shown.set(false);
        }

        return;
      }
      case 'Tab':
        return this.shown.set(false);
    }
  }
}
