import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Sortie, SORTIE_TYPE_META } from '../../models/sortie.model';
import { OneShot, ONESHOT_STATUT_LABELS } from '../../models/oneshot.model';
import { Defi, DEFI_STATUT_LABELS, getDefiStatut } from '../../models/defi.model';
import { ImgRetryDirective } from '../../directives/img-retry.directive';

export type ActiviteItem =
  | { kind: 'sortie';  data: Sortie  }
  | { kind: 'oneshot'; data: OneShot }
  | { kind: 'defi';    data: Defi    };

@Component({
  selector: 'app-activite-card',
  imports: [RouterLink, ImgRetryDirective],
  templateUrl: './activite-card.html',
  styleUrl: './activite-card.css',
})
export class ActiviteCard {
  item     = input.required<ActiviteItem>();
  loggedIn = input(false);
  isPast   = input(false);

  protected routerLink = computed((): string[] => {
    const { kind, data } = this.item();
    if (kind === 'sortie')  return ['/galeries/sorties',  data.id];
    if (kind === 'oneshot') return ['/galeries/oneshots', data.id];
    return ['/galeries/defis', data.id];
  });

  protected coverUrl = computed((): string | undefined => {
    const { kind, data } = this.item();
    if (kind === 'sortie') {
      const s = data as Sortie;
      return this.isPast() ? (s.photoCouvertureUrl || s.imageEvenementUrl) : s.imageEvenementUrl;
    }
    return (data as OneShot | Defi).photoCouvertureUrl;
  });

  protected cardClass = computed((): string => {
    const kind = this.item().kind;
    if (kind === 'oneshot') return 'event-card event-card-oneshot';
    if (kind === 'defi')    return 'event-card event-card-defi';
    return 'event-card';
  });

  protected typeBadge = computed((): { text: string; css: string } => {
    const { kind, data } = this.item();
    if (kind === 'sortie') {
      const meta = SORTIE_TYPE_META[(data as Sortie).type];
      return {
        text: `${meta?.emoji ?? '📸'} ${meta?.label ?? 'Sortie Photo'}`,
        css: 'card-type-badge badge-sortie',
      };
    }
    if (kind === 'oneshot') return { text: '🏆 OneShot',   css: 'card-type-badge badge-oneshot-type' };
    return                         { text: '🏅 Défi Photo', css: 'card-type-badge badge-defi-type'    };
  });

  protected statusBadge = computed((): { text: string; css: string } => {
    const { kind, data } = this.item();
    if (kind === 'sortie') {
      return this.isPast()
        ? { text: 'Terminé',  css: 'card-status status-passee' }
        : { text: 'En cours', css: 'card-status status-avenir' };
    }
    if (kind === 'oneshot') {
      const statut = (data as OneShot).statut;
      const cssMap: Record<string, string> = {
        inscription:            'card-status status-oneshot-inscription',
        fermeture_inscriptions: 'card-status status-oneshot-fermee',
        vote:                   'card-status status-oneshot-vote',
        resultats:              'card-status status-passee',
      };
      return { text: ONESHOT_STATUT_LABELS[statut], css: cssMap[statut] ?? 'card-status' };
    }
    const statut = getDefiStatut(data as Defi);
    const cssMap: Record<string, string> = {
      a_venir:    'card-status status-defi-avenir',
      soumission: 'card-status status-defi-soumission',
      vote:       'card-status status-defi-vote',
      resultats:  'card-status status-passee',
    };
    return { text: DEFI_STATUT_LABELS[statut], css: cssMap[statut] };
  });

  protected dateStr = computed((): string | null => {
    const { kind, data } = this.item();
    if (kind === 'sortie')  return this.formatDate((data as Sortie).date);
    if (kind === 'oneshot') {
      const d = (data as OneShot).date;
      return d ? this.formatDate(d) : null;
    }
    return this.formatDate((data as Defi).dateDebutSoumission);
  });

  protected lieu = computed((): string | null => {
    const { kind, data } = this.item();
    if (kind === 'sortie')  return (data as Sortie).lieu  ?? null;
    if (kind === 'oneshot') return (data as OneShot).lieu ?? null;
    return null;
  });

  protected organisateur = computed((): string | null => {
    const { kind, data } = this.item();
    if (kind === 'sortie')  return (data as Sortie).nomOrganisateur ?? null;
    if (kind === 'oneshot') return (data as OneShot).nomCreateur    ?? null;
    return (data as Defi).organisateurNom ?? null;
  });

  protected sortie  = computed(() => this.item().kind === 'sortie'  ? this.item().data as Sortie  : null);
  protected oneshot = computed(() => this.item().kind === 'oneshot' ? this.item().data as OneShot : null);
  protected defi    = computed(() => this.item().kind === 'defi'    ? this.item().data as Defi    : null);

  protected formatDate(date: string): string {
    return new Date(date + 'T12:00:00').toLocaleDateString('fr-FR', {
      weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
    });
  }

  protected mapsUrl(lieu: string): string {
    return `https://maps.google.com/?q=${encodeURIComponent(lieu)}`;
  }
}
