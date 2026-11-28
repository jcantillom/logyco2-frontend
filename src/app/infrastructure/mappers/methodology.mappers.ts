import { DataOriginShare, InventoryCoverage, Methodology, MethodologyRef } from '../../domain/models/methodology';
import { DataOriginShareDto, InventoryCoverageDto, MethodologyDto, MethodologyRefDto } from '../dto/methodology.dto';

export const toMethodologyRef = (dto: MethodologyRefDto | null | undefined): MethodologyRef | null =>
  dto ? { id: dto.id, version: dto.version, scopeLabel: dto.scope_label ?? '', unit: dto.unit ?? '', hasEstimates: dto.has_estimates === true } : null;

export const toDataOriginShare = (dto: DataOriginShareDto | null | undefined): DataOriginShare | null =>
  dto
    ? {
        verification: dto.verification ?? '',
        hasVerifiedData: dto.has_verified_data === true,
        totalKgCo2: dto.total_kg_co2 ?? 0,
        totalTrips: dto.total_trips ?? 0,
        rounding: dto.rounding ?? '',
        buckets: (dto.buckets ?? []).map((b) => ({
          key: b.key,
          label: b.label ?? b.key,
          meaning: b.meaning ?? '',
          kgCo2: b.kg_co2 ?? 0,
          trips: b.trips ?? 0,
          pct: b.pct ?? null,
          sources: (b.sources ?? []).map((s) => ({ source: s.source, kgCo2: s.kg_co2 ?? 0, trips: s.trips ?? 0, pct: s.pct ?? null })),
        })),
      }
    : null;

export const toInventoryCoverage = (dto: InventoryCoverageDto | null | undefined): InventoryCoverage | null =>
  dto
    ? {
        eligibleTrips: dto.eligible_trips ?? 0,
        calculatedTrips: dto.calculated_trips ?? 0,
        pendingTrips: dto.pending_trips ?? 0,
        blockedTrips: dto.blocked_trips ?? 0,
        coveragePct: dto.coverage_pct ?? null,
        excluded: { heldTrips: dto.excluded?.held_trips ?? 0, duplicateTrips: dto.excluded?.duplicate_trips ?? 0, voidedTrips: dto.excluded?.voided_trips ?? 0 },
        kg: { countedKgCo2: dto.kg?.counted_kg_co2 ?? 0, heldKgCo2: dto.kg?.held_kg_co2 ?? 0, duplicateKgCo2: dto.kg?.duplicate_kg_co2 ?? 0, voidedKgCo2: dto.kg?.voided_kg_co2 ?? 0 },
        denominator: dto.denominator ?? '',
        basis: dto.basis ?? '',
      }
    : null;

export const toMethodology = (dto: MethodologyDto): Methodology => {
  const d = dto.current.declaration;

  return {
    declaration: {
      id: d.id,
      name: d.name ?? d.id,
      version: d.version,
      validFrom: d.valid_from ?? null,
      validTo: d.valid_to ?? null,
      reviewStatus: d.review_status ?? '',
      approvalNote: d.approval_note ?? '',
      referenceStandards: (d.reference_standards ?? []).map((r) => ({ code: r.code, name: r.name ?? r.code, role: r.role ?? '', alignment: r.alignment ?? '' })),
      conformityClaims: d.conformity_claims ?? [],
      notClaimed: d.not_claimed ?? [],
      scope: { boundary: d.emission_scope?.boundary ?? '', label: d.emission_scope?.label ?? '', description: d.emission_scope?.description ?? '', included: d.emission_scope?.included ?? [], excluded: d.emission_scope?.excluded ?? [] },
      gases: (d.gases ?? []).map((g) => ({ gas: g.gas, included: g.included === true, note: g.note ?? '' })),
      unit: { code: d.unit?.code ?? '', label: d.unit?.label ?? '', statement: d.unit?.statement ?? '' },
      factorPolicy: d.factor_policy ?? '',
      activityDataOrigins: (d.activity_data_origins ?? []).map((o) => ({ key: o.key, label: o.label ?? o.key, meaning: o.meaning ?? '' })),
      distanceMethod: d.distance_method ?? [],
      uncertainty: d.uncertainty ?? [],
      limitations: d.limitations ?? [],
      estimatesWarning: d.estimates_warning ?? '',
      dataVerificationStatement: d.data_verification_statement ?? '',
      legalReviewNote: d.legal_review_note ?? '',
    },
    factors: (dto.current.factors ?? []).map((f) => ({
      fuelCode: f.fuel_code,
      name: f.name ?? f.fuel_code,
      gas: f.gas ?? '',
      value: f.value ?? null,
      unit: f.unit ?? '',
      unitLabel: f.unit_label ?? null,
      sourceName: f.source_name ?? null,
      sourceDocument: f.source_document ?? null,
      sourceUrl: f.source_url ?? null,
      referenceYear: f.reference_year ?? null,
      verificationStatus: f.verification_status ?? '',
      usableForCalculation: f.usable_for_calculation === true,
    })),
    usedFactors: (dto.current.used_factors ?? []).map((u) => ({
      fuelCode: u.fuel_code,
      value: u.value ?? '',
      unit: u.unit ?? null,
      unitLabel: u.unit_label ?? null,
      sourceName: u.source_name ?? null,
      sourceDocument: u.source_document ?? null,
      referenceYear: u.reference_year ?? null,
      trips: u.trips ?? 0,
      kgCo2: u.kg_co2 ?? '',
    })),
  };
};
