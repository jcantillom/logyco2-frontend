import { Observable } from 'rxjs';
import { ActivationCheck, ActivationResult, NewMemberOnboarding, NewOrganizationOnboarding, OnboardingStatus, OrganizationOnboarded } from '../models/onboarding';

/** Incorporación de usuarios: el backend decide permisos, identidad, correo y estados; Angular solo presenta. */
export abstract class OnboardingRepository {
  abstract onboardOrganization(request: NewOrganizationOnboarding): Observable<OrganizationOnboarded>;
  abstract onboardMember(request: NewMemberOnboarding): Observable<OnboardingStatus>;
  abstract status(invitationId: string): Observable<OnboardingStatus>;
  abstract resend(invitationId: string): Observable<OnboardingStatus>;
  /** Público: el enlace del correo es la credencial de la persona invitada. */
  abstract checkActivation(code: string): Observable<ActivationCheck>;
  abstract activate(code: string, password: string): Observable<ActivationResult>;
}
