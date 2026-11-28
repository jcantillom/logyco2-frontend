import { HttpTestingController } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ORG_ENVIA } from '../../../testing/builders';
import { METHODOLOGY_URL, methodologyDto } from '../../../testing/methodology';
import { provideTestApp } from '../../../testing/providers';
import { Methodology } from '../../domain/models/methodology';
import { MethodologyRepository } from '../../domain/repositories/methodology.repositories';

describe('HttpMethodologyRepository', () => {
  it('pide GET /organizations/{org}/emissions/methodology y entrega el modelo de dominio', () => {
    TestBed.configureTestingModule({ providers: provideTestApp() });
    const http = TestBed.inject(HttpTestingController);
    let result: Methodology | null = null;

    TestBed.inject(MethodologyRepository).methodology(ORG_ENVIA.id).subscribe((m) => (result = m));
    const request = http.expectOne(METHODOLOGY_URL);

    expect(request.request.method).toBe('GET');
    request.flush({ data: methodologyDto() });
    expect((result as Methodology | null)?.declaration.version).toBe('1.0.0');
    http.verify();
  });
});
