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
  ]);
}
