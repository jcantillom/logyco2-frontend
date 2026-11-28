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
import { DuplicatesRepository } from '../domain/repositories/duplicates.repositories';
import { ManualTripsRepository } from '../domain/repositories/manual-trips.repositories';
import { OperationsRepository } from '../domain/repositories/operations.repositories';
import { ReconciliationRepository } from '../domain/repositories/reconciliation.repositories';
import { EmissionsRepository } from '../domain/repositories/emissions.repositories';
import { FootprintRepository } from '../domain/repositories/footprint.repositories';
import { MethodologyRepository } from '../domain/repositories/methodology.repositories';
import { ImportsRepository } from '../domain/repositories/imports.repositories';
import { PlacesRepository } from '../domain/repositories/places.repositories';
import { NotificationsRepository } from '../domain/repositories/notifications.repositories';
import { PlatformVehiclesRepository, VehiclesRepository } from '../domain/repositories/vehicles.repositories';
import { VehicleEfficiencyRepository } from '../domain/repositories/vehicle-efficiency.repositories';
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
import { HttpDuplicatesRepository } from './repositories/http-duplicates.repositories';
import { HttpManualTripsRepository } from './repositories/http-manual-trips.repositories';
import { HttpOperationsRepository } from './repositories/http-operations.repositories';
import { HttpReconciliationRepository } from './repositories/http-reconciliation.repositories';
import { HttpEmissionsRepository } from './repositories/http-emissions.repositories';
import { HttpFootprintRepository } from './repositories/http-footprint.repositories';
import { HttpMethodologyRepository } from './repositories/http-methodology.repositories';
import { HttpImportsRepository } from './repositories/http-imports.repositories';
import { HttpPlacesRepository } from './repositories/http-places.repositories';
import { HttpNotificationsRepository } from './repositories/http-notifications.repositories';
import { HttpVehicleEfficiencyRepository } from './repositories/http-vehicle-efficiency.repositories';
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
    // Huella de CO₂ de la empresa por periodo (totales, por mes y por combustible).
    { provide: FootprintRepository, useClass: HttpFootprintRepository },
    { provide: MethodologyRepository, useClass: HttpMethodologyRepository },
    // Cargas de la empresa: plantilla, subida y revisión del Excel.
    { provide: ImportsRepository, useClass: HttpImportsRepository },
    // Lugares ambiguos por empresa: qué municipio significa cada texto y cómo deshacerlo.
    { provide: PlacesRepository, useClass: HttpPlacesRepository },
    // Posibles duplicados de viajes retenidos para revisión (Calidad de datos).
    { provide: DuplicatesRepository, useClass: HttpDuplicatesRepository },
    { provide: OperationsRepository, useClass: HttpOperationsRepository },
    // Registrar viajes uno a uno y anularlos (viajes manuales).
    { provide: ManualTripsRepository, useClass: HttpManualTripsRepository },
    // Conciliación de viajes entre empresas vinculadas (autorizaciones y «Operaciones compartidas»).
    { provide: ReconciliationRepository, useClass: HttpReconciliationRepository },
    // Avisos del usuario en la empresa (campana).
    { provide: NotificationsRepository, useClass: HttpNotificationsRepository },
    // Inventario de vehículos de la empresa.
    { provide: VehiclesRepository, useClass: HttpVehiclesRepository },
    // Rendimiento declarado por vehículo y «Ficha por vehículo» (Excel).
    { provide: VehicleEfficiencyRepository, useClass: HttpVehicleEfficiencyRepository },
    // Supervisión de la consola de plataforma: inventario de cualquier empresa, solo lectura.
    { provide: PlatformVehiclesRepository, useClass: HttpPlatformVehiclesRepository },
  ]);
}
