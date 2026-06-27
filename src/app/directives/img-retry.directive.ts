import { Directive, ElementRef, HostListener, inject, OnDestroy } from '@angular/core';

const MAX    = 3;
const DELAYS = [1500, 3000, 6000]; // backoff : 1.5s → 3s → 6s

@Directive({ selector: 'img', standalone: true })
export class ImgRetryDirective implements OnDestroy {
  private el      = inject(ElementRef<HTMLImageElement>);
  private retries = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  @HostListener('load')
  onLoad(): void {
    this.retries = 0;
  }

  @HostListener('error')
  onError(): void {
    const img = this.el.nativeElement;
    const src = img.src;
    if (!src?.includes('firebasestorage.googleapis.com')) return;
    if (this.retries >= MAX) return;

    const delay = DELAYS[this.retries];
    this.retries++;
    // Retire l'éventuel param _r précédent, ajoute le nouveau pour contourner le cache browser
    const base = src.replace(/[&?]_r=\d+/g, '').replace(/[?&]$/, '');
    this.timer = setTimeout(() => {
      img.src = base.includes('?') ? `${base}&_r=${this.retries}` : `${base}?_r=${this.retries}`;
    }, delay);
  }

  ngOnDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }
}
