import { Component, inject, computed, OnInit, OnDestroy, AfterViewInit, ElementRef, NgZone, Injector } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { map, filter, take } from 'rxjs/operators';
import { Subscription, race, timer } from 'rxjs';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ConfigService } from '../../services/config.service';
import { ArticleService } from '../../services/article.service';
import { SortieService } from '../../services/sortie.service';
import { ThemeService } from '../../services/theme.service';
import { PhotoService } from '../../services/photo.service';
import { AuthService } from '../../services/auth.service';
import { Article, getArticleTypeMeta } from '../../models/article.model';
import { ThemeMensuel, computeThemeStatut, ThemeStatut } from '../../models/theme.model';
import { UserProfile } from '../../models/user.model';

gsap.registerPlugin(ScrollTrigger);

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe],
  templateUrl: './home.html',
  styleUrl: './home.css',
})
export class Home implements OnInit, OnDestroy, AfterViewInit {
  private sanitizer      = inject(DomSanitizer);
  private configService  = inject(ConfigService);
  private articleService = inject(ArticleService);
  private sortieService  = inject(SortieService);
  private themeService   = inject(ThemeService);
  private photoService   = inject(PhotoService);
  private authService    = inject(AuthService);
  private zone           = inject(NgZone);
  private el             = inject(ElementRef);
  private injector       = inject(Injector);

  private siteConfig = toSignal(this.configService.getSiteConfig(), { initialValue: {} as any });

  heroStyle = computed((): SafeStyle => {
    const url = this.siteConfig()?.heroImageUrl as string | undefined;
    if (!url) return this.sanitizer.bypassSecurityTrustStyle('none');
    return this.sanitizer.bypassSecurityTrustStyle(`url('${url}')`);
  });

  articles = toSignal(
    this.articleService.getPublicArticles().pipe(
      map(list =>
        list
          .sort((a, b) => (+!!b.epingle) - (+!!a.epingle) || b.dateCreation.localeCompare(a.dateCreation))
          .slice(0, 3)
      )
    ),
    { initialValue: [] as Article[] }
  );

  derniereSortie = toSignal(
    this.sortieService.getSorties().pipe(map(list => list[0] ?? null)),
    { initialValue: null }
  );

  dernierTheme = toSignal(
    this.themeService.getThemes().pipe(map(list => list[0] ?? null)),
    { initialValue: null as any }
  );

  recentPhotos = toSignal(this.photoService.getRecentPublicPhotos(8), { initialValue: [] });

  membres = toSignal(
    this.authService.getAllMembers().pipe(
      map(list => list.filter(m => !m.isSuspended && m.photoProfilUrl).slice(0, 3))
    ),
    { initialValue: [] as UserProfile[] }
  );

  private gsapCtx?: gsap.Context;
  private sub?: Subscription;

  ngOnInit() {
    document.documentElement.style.setProperty('scroll-padding-top', '122px');
  }

  ngAfterViewInit() {
    // Wait for first real data, then init GSAP (2 s fallback if no data)
    this.sub = race(
      toObservable(this.articles, { injector: this.injector }).pipe(
        filter(a => a.length > 0),
        take(1)
      ),
      timer(2000)
    ).pipe(take(1)).subscribe(() => {
      // setTimeout(0) waits for Angular to flush @if DOM changes before GSAP reads the DOM
      setTimeout(() => this.zone.runOutsideAngular(() => this.initGsap()), 0);
    });
  }

  ngOnDestroy() {
    document.documentElement.style.removeProperty('scroll-padding-top');
    this.gsapCtx?.revert();
    this.sub?.unsubscribe();
  }

  private initGsap() {
    this.gsapCtx?.revert();
    const root = this.el.nativeElement as HTMLElement;

    this.gsapCtx = gsap.context(() => {
      this.pinSection(root, '.actu-section',    '.actu-card',   ['right', 'right', 'right']);
      this.pinSection(root, '.act-section',     '.act-card',    ['left',  'right']);
      this.pinGallery(root);
      this.pinSection(root, '.membres-section', '.membre-card', ['left',  'right', 'up']);
    });
  }

  // ── section avec pin + scrub : chaque carte arrive l'une après l'autre ──
  private pinSection(
    root:       HTMLElement,
    sectionSel: string,
    cardSel:    string,
    dirs:       Array<'left' | 'right' | 'up'>,
  ) {
    const section = root.querySelector<HTMLElement>(sectionSel);
    if (!section) return;
    const cards = Array.from(section.querySelectorAll<HTMLElement>(cardSel));
    if (!cards.length) return;

    // Place les cartes hors champ selon leur direction
    cards.forEach((card, i) => {
      const dir = dirs[i] ?? 'right';
      gsap.set(card, {
        x:       dir === 'right' ? 300 : dir === 'left' ? -300 : 0,
        y:       dir === 'up'    ? 100 : 0,
        opacity: 0,
      });
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger:       section,
        start:         'top top',
        // ~120 % viewport par carte → chaque carte = ~120 vh de scroll
        end:           `+=${cards.length * 120}%`,
        pin:           true,
        pinSpacing:    true,
        scrub:         0.8,    // suit le scroll avec légère inertie
        anticipatePin: 1,
      },
    });

    // Cartes en séquence : '>' = "commence quand la précédente est terminée"
    cards.forEach(card => {
      tl.to(card, { x: 0, y: 0, opacity: 1, ease: 'power3.out', duration: 1 }, '>');
    });
  }

  // ── galerie : chaque cellule arrive grande depuis un côté, se réduit à sa place ──
  private pinGallery(root: HTMLElement) {
    const section = root.querySelector<HTMLElement>('.gallery-section');
    if (!section) return;
    const cells = Array.from(section.querySelectorAll<HTMLElement>('.mosaic-cell'));
    if (!cells.length) return;

    // État initial : grande (scale 1.8), hors champ en alternant gauche/droite
    cells.forEach((cell, i) => {
      const fromRight = i % 2 === 0;
      gsap.set(cell, {
        scale:           1.8,
        x:               fromRight ? 250 : -250,
        opacity:         0,
        transformOrigin: '50% 50%',
      });
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger:       section,
        start:         'top top',
        // ~55 % viewport par photo → rapide mais distinct
        end:           `+=${cells.length * 55}%`,
        pin:           true,
        pinSpacing:    true,
        scrub:         0.8,
        anticipatePin: 1,
      },
    });

    // Chaque cellule se place en séquence : arrive grande, se réduit et glisse en place
    cells.forEach(cell => {
      tl.to(cell, {
        scale:   1,
        x:       0,
        opacity: 1,
        ease:    'power3.out',
        duration: 1,
      }, '>');
    });
  }

  // ── helpers template ──

  articleColor(type: Article['type']): string { return getArticleTypeMeta(type).color; }
  articleIcon(type:  Article['type']): string { return getArticleTypeMeta(type).icon;  }
  articleLabel(type: Article['type']): string { return getArticleTypeMeta(type).label; }

  computeStatut(t: ThemeMensuel): ThemeStatut { return computeThemeStatut(t); }

  statutLabel(s: ThemeStatut): string {
    return ({ en_attente: 'À venir', ouvert: 'En cours', vote: 'En vote', resultats: 'Résultats' })[s];
  }

  formatMois(mois: string): string {
    const [y, m] = mois.split('-');
    return new Date(+y, +m - 1, 1).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  }

  nomComplet(m: UserProfile): string { return m.prenom ? `${m.prenom} ${m.nom}` : m.nom; }

  initiales(m: UserProfile): string {
    return ((m.prenom?.[0] ?? '') + (m.nom?.[0] ?? '')).toUpperCase() || '?';
  }
}
