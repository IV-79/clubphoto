import { inject, Injectable } from '@angular/core';
import { Title, Meta } from '@angular/platform-browser';
import { ActivatedRouteSnapshot, RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { DOCUMENT } from '@angular/common';

const DEFAULT_DESCRIPTION =
  'Club de photographie à Tain-Tournon — galeries, thèmes du mois, sorties photo et activités.';
const SITE_NAME = 'Club Photo Tain-Tournon';

@Injectable({ providedIn: 'root' })
export class SeoStrategy extends TitleStrategy {
  private titleSvc = inject(Title);
  private meta = inject(Meta);
  private doc = inject(DOCUMENT);

  override updateTitle(snapshot: RouterStateSnapshot): void {
    const pageTitle = this.buildTitle(snapshot);
    const data = this.deepestData(snapshot.root);
    const description = (data['description'] as string | undefined) ?? DEFAULT_DESCRIPTION;
    const fullTitle = pageTitle ? `${pageTitle} — ${SITE_NAME}` : SITE_NAME;
    const url = this.doc.location.href;

    this.titleSvc.setTitle(fullTitle);
    this.meta.updateTag({ name: 'description', content: description });
    this.meta.updateTag({ property: 'og:title', content: fullTitle });
    this.meta.updateTag({ property: 'og:description', content: description });
    this.meta.updateTag({ property: 'og:url', content: url });
  }

  private deepestData(route: ActivatedRouteSnapshot): Record<string, unknown> {
    let data: Record<string, unknown> = { ...route.data };
    for (const child of route.children) {
      data = { ...data, ...this.deepestData(child) };
    }
    return data;
  }
}
