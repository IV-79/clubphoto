import { Injectable, inject, Injector, runInInjectionContext } from '@angular/core';
import { Firestore, doc, docData, setDoc } from '@angular/fire/firestore';
import { Observable, map, catchError, of } from 'rxjs';
import { PHOTO_CATEGORIES } from '../models/photo.model';

export interface CategorieConfig {
  value: string;
  label: string;
}

const CONFIG_DOC = 'config/photoCategories';

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private firestore = inject(Firestore);
  private injector = inject(Injector);

  getCategories(): Observable<CategorieConfig[]> {
    return runInInjectionContext(this.injector, () =>
      docData(doc(this.firestore, CONFIG_DOC))
    ).pipe(
      map((data: any) => data?.items ?? (PHOTO_CATEGORIES as CategorieConfig[])),
      catchError(() => of(PHOTO_CATEGORIES as CategorieConfig[]))
    );
  }

  async saveCategories(items: CategorieConfig[]): Promise<void> {
    await runInInjectionContext(this.injector, () =>
      setDoc(doc(this.firestore, CONFIG_DOC), { items })
    );
  }
}
