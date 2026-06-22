import { Directive, ElementRef, inject, input, AfterViewInit } from '@angular/core';

@Directive({
  selector: '[reveal]',
  standalone: true,
})
export class RevealDirective implements AfterViewInit {
  revealDir   = input<'up' | 'left' | 'right' | 'fade'>('up');
  revealDelay = input<number>(0);

  private el = inject(ElementRef);

  ngAfterViewInit() {
    const el      = this.el.nativeElement as HTMLElement;
    // Convert stagger slot (0/350/700ms) → range offset (0/10/20%)
    const slot    = Math.round(this.revealDelay() / 350);
    const start   = slot * 10;
    const end     = start + 40;
    el.classList.add(`reveal-${this.revealDir()}`);
    el.style.setProperty('--rs', `${start}%`);
    el.style.setProperty('--re', `${end}%`);
  }
}
