import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { ActivationCheck, ActivationResult, ActivationState, NewMemberOnboarding, NewOrganizationOnboarding, OnboardingStatus, OrganizationOnboarded } from '../../domain/models/onboarding';
import { OnboardingRepository } from '../../domain/repositories/onboarding.repositories';
import { OrganizationDto } from '../dto/identity.dto';
import { ApiClient } from '../http/api-client';
import { toOrganization } from '../mappers/identity.mappers';

export interface OnboardingStatusDto {
  invitation_id: string; organization: { id: string; name: string }; email: string; full_name: string | null; role_code: string;
  invitation_status: string; identity_status: OnboardingStatus['identityStatus']; delivery_status: OnboardingStatus['deliveryStatus'];
  delivery_error_code: string | null; activation: OnboardingStatus['activation']; first_admin: boolean; send_count: number;
  last_sent_at: string | null; expires_at: string; next_step: OnboardingStatus['nextStep'];
}
interface OrganizationOnboardedDto { organization: OrganizationDto; onboarding: OnboardingStatusDto | null; onboarding_error_code: string | null }
interface ActivationCheckDto { state: ActivationState; organization_name: string | null; email: string | null }
interface ActivationDto { email: string; organization_name: string }

export const toOnboardingStatus = (dto: OnboardingStatusDto): OnboardingStatus => ({
  invitationId: dto.invitation_id, organizationId: dto.organization.id, organizationName: dto.organization.name, email: dto.email, fullName: dto.full_name,
  roleCode: dto.role_code, invitationStatus: dto.invitation_status, identityStatus: dto.identity_status, deliveryStatus: dto.delivery_status,
  deliveryErrorCode: dto.delivery_error_code, activation: dto.activation, firstAdmin: dto.first_admin, sendCount: dto.send_count,
  lastSentAt: dto.last_sent_at ? new Date(dto.last_sent_at) : null, expiresAt: new Date(dto.expires_at), nextStep: dto.next_step,
});

@Injectable()
export class HttpOnboardingRepository extends OnboardingRepository {
  private readonly api = inject(ApiClient);

  onboardOrganization(request: NewOrganizationOnboarding): Observable<OrganizationOnboarded> {
    return this.api
      .post<OrganizationOnboardedDto>('/onboarding/organizations', {
        name: request.name, ...(request.legalName ? { legal_name: request.legalName } : {}), ...(request.taxId ? { tax_id: request.taxId } : {}),
        type_codes: request.typeCodes, admin_email: request.adminEmail, admin_full_name: request.adminFullName,
      })
      .pipe(map((dto) => ({
        organization: toOrganization(dto.organization), onboarding: dto.onboarding ? toOnboardingStatus(dto.onboarding) : null, onboardingErrorCode: dto.onboarding_error_code,
      })));
  }

  onboardMember(request: NewMemberOnboarding): Observable<OnboardingStatus> {
    return this.api
      .post<OnboardingStatusDto>('/onboarding/members', { organization_id: request.organizationId, email: request.email, full_name: request.fullName, role_code: request.roleCode })
      .pipe(map(toOnboardingStatus));
  }

  status(invitationId: string): Observable<OnboardingStatus> {
    return this.api.get<OnboardingStatusDto>(`/onboarding/invitations/${encodeURIComponent(invitationId)}`).pipe(map(toOnboardingStatus));
  }

  resend(invitationId: string): Observable<OnboardingStatus> {
    return this.api.post<OnboardingStatusDto>(`/onboarding/invitations/${encodeURIComponent(invitationId)}/resend`, {}).pipe(map(toOnboardingStatus));
  }

  checkActivation(code: string): Observable<ActivationCheck> {
    return this.api.post<ActivationCheckDto>('/onboarding/activation/check', { code }).pipe(map((dto) => ({ state: dto.state, organizationName: dto.organization_name, email: dto.email })));
  }

  activate(code: string, password: string): Observable<ActivationResult> {
    return this.api.post<ActivationDto>('/onboarding/activation', { code, password }).pipe(map((dto) => ({ email: dto.email, organizationName: dto.organization_name })));
  }
}
