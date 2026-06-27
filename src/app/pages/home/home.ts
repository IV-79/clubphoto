import { Component, inject, computed, OnInit, OnDestroy, AfterViewInit, ElementRef, NgZone, Injector, signal, effect } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DatePipe } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { DomSanitizer, SafeStyle } from '@angular/platform-browser';
import { toSignal, toObservable } from '@angular/core/rxjs-interop';
import { map, filter, take, switchMap, shareReplay } from 'rxjs/operators';
import { Subscription, race, timer, combineLatest, of } from 'rxjs';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { ConfigService } from '../../services/config.service';
import { ArticleService } from '../../services/article.service';
import { SortieService } from '../../services/sortie.service';
import { ThemeService } from '../../services/theme.service';
import { PhotoService } from '../../services/photo.service';
import { AuthService } from '../../services/auth.service';
import { Article, getArticleTypeMeta } from '../../models/article.model';
import { ThemeMensuel, computeThemeStatut, ThemeStatut } from '../../models/theme.model';
import { UserProfile } from '../../models/user.model';
import { ImgRetryDirective } from '../../directives/img-retry.directive';

gsap.registerPlugin(ScrollTrigger, ScrollToPlugin);

interface NavItem {
  id:     string;
  label:  string;
  target: number; // scrollY cible au clic (début de la section)
  from:   number; // scrollY à partir duquel ce dot devient actif
}

@Component({
  selector: 'app-home',
  imports: [RouterLink, DatePipe, MatIconModule, ImgRetryDirective],
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

  private siteConfig = toSignal(this.configService.getSiteConfigOnce(), { initialValue: {} as any });

  private heroThemeUrl = toSignal(
    this.configService.getSiteConfigOnce().pipe(
      switchMap(cfg => {
        if (cfg?.heroSource !== 'theme_du_mois') return of(null);
        return this.themeService.getThemesOnce().pipe(
          map(themes => themes.find(t => computeThemeStatut(t) === 'resultats') ?? null),
          switchMap(theme => {
            if (!theme) return of(null);
            return combineLatest([
              this.themeService.getSoumissionsOnce(theme.id),
              this.themeService.getTousVotesOnce(theme.id),
            ]).pipe(
              map(([soumissions, votes]) => {
                if (!soumissions.length) return null;
                const count = new Map<string, number>();
                votes.forEach(v => count.set(v.soumissionId, (count.get(v.soumissionId) ?? 0) + 1));
                const winner = [...soumissions].sort((a, b) => {
                  const diff = (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0);
                  return diff !== 0 ? diff : a.uploadedAt.localeCompare(b.uploadedAt);
                })[0];
                return winner?.url ?? null;
              })
            );
          })
        );
      })
    ),
    { initialValue: null as string | null }
  );

  heroStyle = computed((): SafeStyle => {
    const cfg = this.siteConfig();
    const url = cfg?.heroSource === 'theme_du_mois'
      ? (this.heroThemeUrl() ?? cfg?.heroImageUrl ?? '')
      : (cfg?.heroImageUrl ?? '');
    if (!url) return this.sanitizer.bypassSecurityTrustStyle('none');
    return this.sanitizer.bypassSecurityTrustStyle(`url('${url}')`);
  });

  articles = toSignal(
    this.articleService.getPublicArticlesOnce().pipe(
      map(list =>
        list
          .sort((a, b) => (+!!b.epingle) - (+!!a.epingle) || b.dateCreation.localeCompare(a.dateCreation))
          .slice(0, 3)
      )
    ),
    { initialValue: [] as Article[] }
  );

  derniereSortie = toSignal(
    this.sortieService.getSortiesOnce().pipe(map(list => list[0] ?? null)),
    { initialValue: null }
  );

  dernierTheme = toSignal(
    this.themeService.getThemesOnce().pipe(map(list => list[0] ?? null)),
    { initialValue: null as any }
  );

  // Shared one-time read — both recentPhotos and membres derive from it without double read
  private membresOnce$ = this.authService.getAllMembersOnce().pipe(shareReplay(1));

  recentPhotos = toSignal(
    combineLatest([
      this.photoService.getRecentPublicPhotosOnce(60),
      this.membresOnce$.pipe(
        map(members => new Set(
          members
            .filter(m => m.visibilite === 'public' && !m.isSuspended)
            .map(m => m.uid)
        ))
      ),
    ]).pipe(
      map(([photos, publicUids]) => {
        const filtered = photos.filter(p => publicUids.has(p.uid));
        for (let i = filtered.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [filtered[i], filtered[j]] = [filtered[j], filtered[i]];
        }
        return filtered.slice(0, 8);
      })
    ),
    { initialValue: [] }
  );

  membres = toSignal(
    this.membresOnce$.pipe(
      map(list => list.filter(m => !m.isSuspended && m.photoProfilUrl).slice(0, 3))
    ),
    { initialValue: [] as UserProfile[] }
  );

  // Navigation verticale
  navItems  = signal<NavItem[]>([]);
  activeNav = signal<string>('hero');

  private gsapReady = signal(false);

  private gsapCtx?: gsap.Context;
  private actuST?:    ScrollTrigger;
  private actST?:     ScrollTrigger;
  private membresST?: ScrollTrigger;
  private sub?: Subscription;
  private scrollHandler?: () => void;

  constructor() {
    // Quand les photos arrivent après init GSAP, recalculer les positions des dots
    effect(() => {
      const photos = this.recentPhotos();
      if (photos.length > 0 && this.gsapReady()) {
        this.zone.runOutsideAngular(() => {
          setTimeout(() => {
            ScrollTrigger.refresh();
            this.recalcNavGallery();
          }, 300);
        });
      }
    });
  }

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

    this.gsapCtx = gsap.context(() => {
      this.actuST    = this.pinSection(root, '.actu-section',    '.actu-card',   ['left', 'right', 'up']);
      this.actST     = this.pinSection(root, '.act-section',     '.act-card',    ['left',  'right']);
      this.animateGallery(root);
      this.membresST = this.pinSection(root, '.membres-section', '.membre-card', ['left',  'right', 'up']);
    });

    ScrollTrigger.refresh();
    requestAnimationFrame(() => {
      this.buildNavItems(root);
      this.zone.run(() => this.gsapReady.set(true));
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

  private buildNavItems(root: HTMLElement) {
    const vh           = window.innerHeight;
    const actuStart    = this.actuST?.start    ?? vh;
    const actuEnd      = this.actuST?.end      ?? actuStart + vh * 0.3;
    const actStart     = this.actST?.start     ?? actuEnd;
    const actEnd       = this.actST?.end       ?? actStart + vh * 0.3;
    const galleryEl    = root.querySelector<HTMLElement>('.gallery-section');
    const galleryStart = galleryEl ? galleryEl.getBoundingClientRect().top + window.scrollY : actEnd;
    const galleryEnd   = galleryEl ? galleryStart + galleryEl.offsetHeight : galleryStart + vh;
    const membresStart = this.membresST?.start ?? galleryEnd;
    const membresEnd   = this.membresST?.end   ?? membresStart + vh * 0.3;
    const ctaEl        = root.querySelector<HTMLElement>('.cta-section');
    const ctaStart     = ctaEl ? ctaEl.getBoundingClientRect().top + window.scrollY : membresEnd + 56;

    this.zone.run(() => this.navItems.set([
      { id: 'hero',      label: 'Accueil',        target: 0,            from: 0            },
      { id: 'actu',      label: 'À la une',       target: actuStart,    from: actuStart    },
      { id: 'act',       label: 'Nos activités',  target: actStart,     from: actStart     },
      { id: 'gallery',   label: 'Galerie',        target: galleryStart, from: galleryStart },
      { id: 'membres',   label: 'Photographes',   target: membresStart, from: membresStart },
      { id: 'rejoindre', label: 'Rejoignez-nous', target: ctaStart,     from: membresEnd   },
    ]));
  }

  // Recalcule uniquement les positions gallery→fin quand les photos chargent après init GSAP
  private recalcNavGallery() {
    const root         = this.el.nativeElement as HTMLElement;
    const galleryEl    = root.querySelector<HTMLElement>('.gallery-section');
    if (!galleryEl) return;
    const galleryStart  = galleryEl.getBoundingClientRect().top + window.scrollY;
    const galleryEnd    = galleryStart + galleryEl.offsetHeight;
    const membresStart  = this.membresST?.start ?? galleryEnd;
    const membresEnd    = this.membresST?.end   ?? membresStart + window.innerHeight * 0.3;
    const ctaEl         = root.querySelector<HTMLElement>('.cta-section');
    const ctaStart      = ctaEl ? ctaEl.getBoundingClientRect().top + window.scrollY : membresEnd + 56;

    this.zone.run(() => {
      this.navItems.set(this.navItems().map(item => {
        if (item.id === 'gallery')   return { ...item, target: galleryStart, from: galleryStart };
        if (item.id === 'membres')   return { ...item, target: membresStart, from: galleryEnd   };
        if (item.id === 'rejoindre') return { ...item, target: ctaStart,     from: membresEnd   };
        return item;
      }));
    });
  }

  private smoothScrollTo(y: number) {
    const distance = Math.abs(y - window.scrollY);
    const duration = Math.min(Math.max(distance / 500, 1), 5);
    gsap.to(window, { scrollTo: { y }, duration, ease: 'none' });
  }

  scrollToSection(target: number) {
    this.smoothScrollTo(target);
  }

  /** Flèche bas fixe : descend vers la section suivante selon la position courante */
  scrollDown() {
    const items   = this.navItems();
    const current = this.activeNav();
    const idx     = items.findIndex(i => i.id === current);
    const next    = items[idx + 1];
    this.smoothScrollTo(next?.target ?? window.innerHeight);
  }

  // ── section : cartes animent pendant la montée, pin pour contempler ──
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

    // Cartes animent pendant que la section scrolle dans le viewport (pas de pin)
    const animTL = gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start:   'top 80%',
        end:     'top top',
        scrub:   0.8,
      },
    });
    cards.forEach(card => {
      animTL.to(card, { x: 0, y: 0, opacity: 1, ease: 'power3.out', duration: 1 }, 0);
    });

    // Pin séparé : verrouille la section à l'écran une fois arrivée
    const pinST = ScrollTrigger.create({
      trigger:       section,
      start:         'top top',
      end:           '+=30%',
      pin:           true,
      pinSpacing:    true,
      anticipatePin: 1,
    });

    return pinST;
  }

  // ── galerie : animation d'entrée sans pin (hauteur auto variable selon les photos) ──
  private animateGallery(root: HTMLElement): void {
    const section = root.querySelector<HTMLElement>('.gallery-section');
    if (!section) return;
    const cells = Array.from(section.querySelectorAll<HTMLElement>('.mosaic-cell'));
    if (!cells.length) return;

    cells.forEach((cell, i) => {
      gsap.set(cell, {
        scale:           1.5,
        x:               i % 2 === 0 ? 200 : -200,
        opacity:         0,
        transformOrigin: '50% 50%',
      });
    });

    gsap.timeline({
      scrollTrigger: {
        trigger: section,
        start:   'top 80%',
        end:     'top 20%',
        scrub:   0.8,
      },
    }).to(cells, { scale: 1, x: 0, opacity: 1, ease: 'power3.out', duration: 1 }, 0);
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
