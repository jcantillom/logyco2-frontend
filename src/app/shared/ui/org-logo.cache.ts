import { Injectable, inject } from '@angular/core';
import { Observable, catchError, map, of, shareReplay, tap } from 'rxjs';
import { OrganizationsRepository } from '../../domain/repositories/identity.repositories';

/**
 * Logos de empresas como URL local (`blob:`), guardados por empresa + versión: un listado de N empresas pide solo las imágenes que
 * existen y una sola vez, y una versión nueva (el administrador cambió el logo) reemplaza a la anterior. Si la imagen no se puede
 * pedir, el logo simplemente no se muestra.
 */
@Injectable({ providedIn: 'root' })
export class OrgLogoCache {
  private readonly repository = inject(OrganizationsRepository);
  private readonly ready = new Map<string, Observable<string | null>>();
  private readonly versionOf = new Map<string, string>();

  get(organizationId: string, version: string): Observable<string | null> {
    const key = `${organizationId}:${version}`;
    const cached = this.ready.get(key);

    if (cached) return cached;

    const request = this.repository.logo(organizationId).pipe(
      map((blob) => (blob ? URL.createObjectURL(blob) : null)),
      catchError(() => of(null)),
      tap((url) => this.replacePrevious(organizationId, key, url)),
      shareReplay(1),
    );

    this.ready.set(key, request);

    return request;
  }

  /** Al llegar una versión nueva se libera la imagen anterior de esa empresa. */
  private replacePrevious(organizationId: string, key: string, url: string | null): void {
    const previous = this.versionOf.get(organizationId);

    if (previous && previous !== key) {
      this.ready.get(previous)?.subscribe((old) => old && URL.revokeObjectURL(old)).unsubscribe();
      this.ready.delete(previous);
    }

    if (url) this.versionOf.set(organizationId, key);
  }
}
