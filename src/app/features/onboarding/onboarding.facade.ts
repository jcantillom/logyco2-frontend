import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ActivationCheck, ActivationResult, NewMemberOnboarding, NewOrganizationOnboarding, OnboardingStatus, OrganizationOnboarded } from '../../domain/models/onboarding';
import { OnboardingRepository } from '../../domain/repositories/onboarding.repositories';

/** Casos de uso de la incorporación (los mismos para el SUPER_ADMIN y el ORG_ADMIN). */
@Injectable({ providedIn: 'root' })
export class OnboardingFacade {
  private readonly repository = inject(OnboardingRepository);

  onboardOrganization(request: NewOrganizationOnboarding): Observable<OrganizationOnboarded> {
    return this.repository.onboardOrganization(request);
  }
  onboardMember(request: NewMemberOnboarding): Observable<OnboardingStatus> {
    return this.repository.onboardMember(request);
  }
  status(invitationId: string): Observable<OnboardingStatus> {
    return this.repository.status(invitationId);
  }
  resend(invitationId: string): Observable<OnboardingStatus> {
    return this.repository.resend(invitationId);
  }
  checkActivation(code: string): Observable<ActivationCheck> {
    return this.repository.checkActivation(code);
  }
  activate(code: string, password: string): Observable<ActivationResult> {
    return this.repository.activate(code, password);
  }
}
