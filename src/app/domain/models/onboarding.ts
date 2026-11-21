import { Organization } from './organization';

/** Estado real de una incorporación (identidad, correo y activación). Nunca incluye enlaces ni contraseñas. */
export type OnboardingNextStep = 'RETRY_IDENTITY' | 'RESEND_EMAIL' | 'WAIT_ACTIVATION' | 'WAIT_ACCEPTANCE' | 'DONE';

export interface OnboardingStatus {
  readonly invitationId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly email: string;
  readonly fullName: string | null;
  readonly roleCode: string;
  readonly invitationStatus: string;
  /** `null` = la identidad corporativa aún no se consultó o creó. */
  readonly identityStatus: 'CREATED' | 'EXISTING' | null;
  readonly deliveryStatus: 'NOT_SENT' | 'SENT' | 'FAILED';
  readonly deliveryErrorCode: string | null;
  readonly activation: 'PENDING' | 'DONE' | 'NOT_REQUIRED';
  readonly firstAdmin: boolean;
  readonly sendCount: number;
  readonly lastSentAt: Date | null;
  readonly expiresAt: Date;
  readonly nextStep: OnboardingNextStep;
}

export interface NewMemberOnboarding {
  readonly organizationId: string;
  readonly email: string;
  readonly fullName: string;
  readonly roleCode: string;
}

export interface NewOrganizationOnboarding {
  readonly name: string;
  readonly legalName?: string;
  readonly taxId?: string;
  readonly typeCodes: readonly string[];
  readonly adminEmail: string;
  readonly adminFullName: string;
}

export interface OrganizationOnboarded {
  readonly organization: Organization;
  readonly onboarding: OnboardingStatus | null;
  readonly onboardingErrorCode: string | null;
}

export type ActivationState = 'VALID' | 'EXPIRED' | 'USED' | 'NOT_APPLICABLE' | 'INVALID';

export interface ActivationCheck {
  readonly state: ActivationState;
  readonly organizationName: string | null;
  readonly email: string | null;
}

export interface ActivationResult {
  readonly email: string;
  readonly organizationName: string;
}
