import { Component, inject, computed, OnInit, OnDestroy, AfterViewInit, ElementRef, NgZone, Injector, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
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

interface NavItem {
  id:     string;
  label:  string;
  target: number; // scrollY cible au clic (début de la section)
  from:   number; // scrollY à partir duquel ce dot devient actif
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, MatIconModule],
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

  // Navigation verticale
  navItems  = signal<NavItem[]>([]);
  activeNav = signal<string>('hero');

  private gsapCtx?: gsap.Context;
  private sub?: Subscription;
  private scrollHandler?: () => void;

  ngOnInit() {
    document.documentElement.style.setProperty('scroll-padding-top', '122px');
  }

  ngAfterViewInit() {
    this.sub = race(
      toObservable(this.articles, { injector: this.injector }).pipe(
        filter(a => a.length > 0),
        take(1)
      ),
      timer(2000)
    ).pipe(take(1)).subscribe(() => {
      setTimeout(() => this.zone.runOutsideAngular(() => this.initGsap()), 0);
    });
  }

  ngOnDestroy() {
    document.documentElement.style.removeProperty('scroll-padding-top');
    this.gsapCtx?.revert();
    this.sub?.unsubscribe();
    if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
  }

  private initGsap() {
    this.gsapCtx?.revert();
    const root = this.el.nativeElement as HTMLElement;

    // Capturer les ST en dehors du context pour les lire après refresh
    let actuST:    ScrollTrigger | undefined;
    let actST:     ScrollTrigger | undefined;
    let galleryST: ScrollTrigger | undefined;
    let membresST: ScrollTrigger | undefined;

    this.gsapCtx = gsap.context(() => {
      actuST    = this.pinSection(root, '.actu-section',    '.actu-card',   ['right', 'right', 'right']);
      actST     = this.pinSection(root, '.act-section',     '.act-card',    ['left',  'right']);
      galleryST = this.pinGallery(root);
      membresST = this.pinSection(root, '.membres-section', '.membre-card', ['left',  'right', 'up']);
    });

    // Forcer GSAP à recalculer les positions avec les spacers en place,
    // puis lire dans le frame suivant (les spacers sont mesurés de façon asynchrone)
    ScrollTrigger.refresh();
    requestAnimationFrame(() => {
      const vh = window.innerHeight;
      const actuStart    = actuST?.start    ?? vh;
      const actuEnd      = actuST?.end      ?? actuStart + vh * 3;
      const actStart     = actST?.start     ?? actuEnd;
      const actEnd       = actST?.end       ?? actStart + vh * 2;
      const galleryStart = galleryST?.start ?? actEnd;
      const galleryEnd   = galleryST?.end   ?? galleryStart + vh * 4;
      const membresStart = membresST?.start ?? galleryEnd;
      const membresEnd   = membresST?.end   ?? membresStart + vh * 3;

      // Position réelle du CTA dans le document (spacers GSAP déjà en place)
      const ctaEl    = root.querySelector<HTMLElement>('.cta-section');
      const ctaStart = ctaEl
        ? ctaEl.getBoundingClientRect().top + window.scrollY
        : membresEnd + 56;

      this.zone.run(() => this.navItems.set([
        { id: 'hero',      label: 'Accueil',        target: 0,              from: 0          },
        { id: 'actu',      label: 'À la une',       target: actuEnd - 1,    from: actuStart  },
        { id: 'act',       label: 'Nos activités',  target: actEnd - 1,     from: actStart   },
        { id: 'gallery',   label: 'Galerie',        target: galleryEnd - 1, from: galleryStart },
        { id: 'membres',   label: 'Photographes',   target: membresEnd - 1, from: membresStart },
        { id: 'rejoindre', label: 'Rejoignez-nous', target: ctaStart,       from: membresEnd },
      ]));
    });

    // Mise à jour du dot actif au scroll
    if (this.scrollHandler) window.removeEventListener('scroll', this.scrollHandler);
    this.scrollHandler = () => {
      const y     = window.scrollY;
      const items = this.navItems();
      if (!items.length) return;
      let active = 'hero';
      for (const item of items) {
        if (y >= item.from) active = item.id;
      }
      this.zone.run(() => this.activeNav.set(active));
    };
    window.addEventListener('scroll', this.scrollHandler, { passive: true });
  }

  scrollToSection(target: number) {
    window.scrollTo({ top: target, behavior: 'smooth' });
  }

  /** Flèche bas fixe : descend vers la section suivante selon la position courante */
  scrollDown() {
    const items   = this.navItems();
    const current = this.activeNav();
    const idx     = items.findIndex(i => i.id === current);
    const next    = items[idx + 1];
    window.scrollTo({ top: next?.target ?? window.innerHeight, behavior: 'smooth' });
  }

  // ── section avec pin + scrub ──
  private pinSection(
    root:       HTMLElement,
    sectionSel: string,
    cardSel:    string,
    dirs:       Array<'left' | 'right' | 'up'>,
  ): ScrollTrigger | undefined {
    const section = root.querySelector<HTMLElement>(sectionSel);
    if (!section) return;
    const cards = Array.from(section.querySelectorAll<HTMLElement>(cardSel));
    if (!cards.length) return;

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
        end:           `+=${cards.length * 120}%`,
        pin:           true,
        pinSpacing:    true,
        scrub:         0.8,
        anticipatePin: 1,
      },
    });

    cards.forEach(card => {
      tl.to(card, { x: 0, y: 0, opacity: 1, ease: 'power3.out', duration: 1 }, '>');
    });

    return tl.scrollTrigger ?? undefined;
  }

  // ── galerie : chaque cellule arrive grande puis se réduit à sa place ──
  private pinGallery(root: HTMLElement): ScrollTrigger | undefined {
    const section = root.querySelector<HTMLElement>('.gallery-section');
    if (!section) return;
    const cells = Array.from(section.querySelectorAll<HTMLElement>('.mosaic-cell'));
    if (!cells.length) return;

    cells.forEach((cell, i) => {
      gsap.set(cell, {
        scale:           1.8,
        x:               i % 2 === 0 ? 250 : -250,
        opacity:         0,
        transformOrigin: '50% 50%',
      });
    });

    const tl = gsap.timeline({
      scrollTrigger: {
        trigger:       section,
        start:         'top top',
        end:           `+=${cells.length * 55}%`,
        pin:           true,
        pinSpacing:    true,
        scrub:         0.8,
        anticipatePin: 1,
      },
    });

    cells.forEach(cell => {
      tl.to(cell, { scale: 1, x: 0, opacity: 1, ease: 'power3.out', duration: 1 }, '>');
    });

    return tl.scrollTrigger ?? undefined;
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
