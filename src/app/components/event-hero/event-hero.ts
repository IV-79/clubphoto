import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { ImgRetryDirective } from '../../directives/img-retry.directive';

export interface HeroBadge {
  text: string;
  css: string;
}

@Component({
  selector: 'app-event-hero',
  imports: [RouterLink, ImgRetryDirective, MatIconModule],
  templateUrl: './event-hero.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './event-hero.css',
})
export class EventHero {
  coverUrl = input<string>();
  backLink = input.required<string[]>();
  backLabel = input('Activités');
  typeBadge = input.required<HeroBadge>();
  status = input.required<HeroBadge>();
  titre = input.required<string>();
  organisateur = input<string>();
  date = input<string>();
  lieu = input<string>();
  loggedIn = input(false);
  canEdit = input(false);
  canDelete = input(false);
  editClick = output<void>();
  deleteClick = output<void>();

  protected formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
  }

  protected mapsUrl(lieu: string): string {
    return `https://maps.google.com/?q=${encodeURIComponent(lieu)}`;
  }
}
