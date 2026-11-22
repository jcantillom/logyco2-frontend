import { LinksRepository } from '../domain/repositories/links.repository';
import { HttpLinksRepository } from './repositories/http-links.repository';
import { EnvironmentProviders, makeEnvironmentProviders } from '@angular/core';
import {
  AuthRepository,
  InvitationsRepository,
  MembershipsRepository,
  OrganizationAdminRepository,
  OrganizationsRepository,
  UsersRepository,
} from '../domain/repositories/identity.repositories';
import { EmissionsRepository } from '../domain/repositories/emissions.repositories';
import { ImportsRepository } from '../domain/repositories/imports.repositories';
import { NotificationsRepository } from '../domain/repositories/notifications.repositories';
import { PlatformVehiclesRepository, VehiclesRepository } from '../domain/repositories/vehicles.repositories';
import { IntelligenceRepository } from '../domain/repositories/intelligence.repositories';
import { OnboardingRepository } from '../domain/repositories/onboarding.repositories';
import {
  InsightsRepository,
  RbacRepository,
  SuperAdminsRepository,
} from '../domain/repositories/platform-admin.repositories';
import { AdminMetricsRepository, HealthRepository } from '../domain/repositories/platform.repositories';
import { HttpAdminMetricsRepository } from './repositories/http-admin-metrics.repository';
import {
  HttpInsightsRepository,
  HttpRbacRepository,
  HttpSuperAdminsRepository,
} from './repositories/http-platform-admin.repositories';
import { HttpEmissionsRepository } from './repositories/http-emissions.repositories';
import { HttpImportsRepository } from './repositories/http-imports.repositories';
import { HttpNotificationsRepository } from './repositories/http-notifications.repositories';
import { HttpPlatformVehiclesRepository, HttpVehiclesRepository } from './repositories/http-vehicles.repositories';
import { HttpHealthRepository } from './repositories/http-health.repository';
import { HttpIntelligenceRepository } from './repositories/http-intelligence.repository';
import { HttpOnboardingRepository } from './repositories/http-onboarding.repository';
import {
  HttpAuthRepository,
  HttpInvitationsRepository,
  HttpMembershipsRepository,
  HttpOrganizationAdminRepository,
  HttpOrganizationsRepository,
  HttpUsersRepository,
} from './repositories/http-identity.repositories';

/**
 * Único lugar donde los contratos del dominio se enlazan con sus
 * implementaciones. Cambiar de HTTP a otra fuente solo toca este archivo.
 */
export function provideRepositories(): EnvironmentProviders {
  return makeEnvironmentProviders([
    // Integración real con el backend FastAPI existente.
    { provide: AuthRepository, useClass: HttpAuthRepository },
    { provide: OrganizationsRepository, useClass: HttpOrganizationsRepository },
    { provide: UsersRepository, useClass: HttpUsersRepository },
    { provide: InvitationsRepository, useClass: HttpInvitationsRepository },
    { provide: MembershipsRepository, useClass: HttpMembershipsRepository },
    { provide: OnboardingRepository, useClass: HttpOnboardingRepository },
    { provide: OrganizationAdminRepository, useClass: HttpOrganizationAdminRepository },
    { provide: LinksRepository, useClass: HttpLinksRepository },

    // Consola de plataforma.
    { provide: HealthRepository, useClass: HttpHealthRepository },
    { provide: AdminMetricsRepository, useClass: HttpAdminMetricsRepository },
    { provide: SuperAdminsRepository, useClass: HttpSuperAdminsRepository },
    { provide: InsightsRepository, useClass: HttpInsightsRepository },
    // Indicadores sectoriales reales (no se muestran valores ficticios).
    { provide: IntelligenceRepository, useClass: HttpIntelligenceRepository },
    { provide: RbacRepository, useClass: HttpRbacRepository },
    // Guía de cálculo de emisiones (vehículos, factor del diésel B2 y simulación).
    { provide: EmissionsRepository, useClass: HttpEmissionsRepository },
    // Cargas de la empresa: plantilla, subida y revisión del Excel.
    { provide: ImportsRepository, useClass: HttpImportsRepository },
    // Avisos del usuario en la empresa (campana).
    { provide: NotificationsRepository, useClass: HttpNotificationsRepository },
    // Inventario de vehículos de la empresa.
    { provide: VehiclesRepository, useClass: HttpVehiclesRepository },
    // Supervisión de la consola de plataforma: inventario de cualquier empresa, solo lectura.
    { provide: PlatformVehiclesRepository, useClass: HttpPlatformVehiclesRepository },
  ]);
}
