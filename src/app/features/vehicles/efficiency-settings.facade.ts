import { Injectable, computed, inject, signal } from '@angular/core';
import { AccessPolicy } from '../../core/auth/access-policy';
import { AppError } from '../../core/errors/app-error';
import { toAppError } from '../../core/errors/http-error-mapper';
import { ContextResetRegistry } from '../../core/org/context-reset';
import { OrganizationContext } from '../../core/org/organization-context';
import { ScopedResource } from '../../core/org/scoped-resource';
import { EfficiencySettings, EfficiencySettingsChange } from '../../domain/models/vehicle-efficiency';
import { VehicleEfficiencyRepository } from '../../domain/repositories/vehicle-efficiency.repositories';

/**
 * Ajustes de la empresa para la importación: modo de estimación del rendimiento y modo de la unidad de la carga. Leer pide `vehicles:read`;
 * cambiar, `vehicles:manage` (el servidor autoriza: aquí solo se oculta lo que no se puede hacer). Lo que responde el servidor reemplaza lo
 * mostrado; nada se adivina antes de que responda.
 */
@Injectable({ providedIn: 'root' })
export class EfficiencySettingsFacade {
  private readonly repository = inject(VehicleEfficiencyRepository);
  private readonly context = inject(OrganizationContext);
  private readonly access = inject(AccessPolicy);
  private readonly registry = inject(ContextResetRegistry);

  readonly settings = this.registry.track(new ScopedResource<EfficiencySettings>());
  readonly saving = signal(false);
  readonly saveError = signal<AppError | null>(null);
  /** Cuenta los guardados fallidos: la pantalla vuelve a dibujar las opciones desde lo que el servidor tiene guardado. */
  readonly saveFailures = signal(0);
  /** Aviso para lectores de pantalla tras guardar. */
  readonly announcement = signal('');

  readonly canRead = computed(() => this.access.can('vehicles:read'));
  readonly canManage = computed(() => this.access.can('vehicles:manage'));
  /** En modo ASK con la estimación encendida en el servidor: la confirmación de vehículos pide el consentimiento. */
  readonly asksConsent = computed(() => {
    const settings = this.settings.data();

    return !!settings && settings.platformEnabled && settings.mode === 'ASK';
  });

  constructor() {
    this.registry.track({
      reset: () => {
        this.saving.set(false);
        this.saveError.set(null);
        this.announcement.set('');
      },
    });
  }

  load(): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.canRead()) return;

    this.settings.load(this.repository.settings(organizationId), { keepData: true });
  }

  update(change: EfficiencySettingsChange, announcement: string): void {
    const organizationId = this.context.activeOrganizationId();

    if (!organizationId || !this.canManage() || this.saving()) return;

    this.saving.set(true);
    this.saveError.set(null);
    this.repository.updateSettings(organizationId, change).subscribe({
      next: (settings) => {
        this.saving.set(false);
        this.settings.replace(settings);
        this.announcement.set(announcement);
      },
      error: (error: unknown) => {
        this.saving.set(false);
        this.saveError.set(toAppError(error));
        this.saveFailures.update((n) => n + 1);
      },
    });
  }
}
