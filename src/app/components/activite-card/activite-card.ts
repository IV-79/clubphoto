import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Sortie, SORTIE_TYPE_META } from '../../models/sortie.model';
import { OneShot, ONESHOT_STATUT_LABELS } from '../../models/oneshot.model';
import { Defi, DEFI_STATUT_LABELS, getDefiStatut } from '../../models/defi.model';
import { MatIconModule } from '@angular/material/icon';
import { ImgRetryDirective } from '../../directives/img-retry.directive';

export type ActiviteItem =
  | { kind: 'sortie';  data: Sortie  }
  | { kind: 'oneshot'; data: OneShot }
  | { kind: 'defi';    data: Defi    };

@Component({
  selector: 'app-activite-card',
  imports: [RouterLink, ImgRetryDirective, MatIconModule],
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
    if (kind === 'sortie') return (data as Sortie).imageEvenementUrl;
    return (data as OneShot | Defi).photoCouvertureUrl;
  });

  protected placeholderIcon = computed((): string => {
    const { kind, data } = this.item();
    if (kind === 'sortie') return SORTIE_TYPE_META[(data as Sortie).type]?.emoji ?? '📷';
    if (kind === 'oneshot') return '📸';
    return '🏅';
  });

  protected placeholderCss = computed((): string => {
    const kind = this.item().kind;
    return `cover-placeholder placeholder-${kind}`;
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
      if (this.isPast()) return { text: 'Terminé', css: 'card-status status-passee' };
      const date = (data as Sortie).date;
      const n = new Date();
      const todayStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;

      if (date === todayStr)           return { text: 'En cours', css: 'card-status status-encours' };
      if (this.isDateWithin7Days(date)) return { text: 'Bientôt',  css: 'card-status status-bientot' };
      return { text: 'À venir', css: 'card-status status-avenir' };
    }
    if (kind === 'oneshot') {
      const o = data as OneShot;
      if (o.statut === 'preparation') {
        return { text: 'En préparation', css: 'card-status status-preparation' };
      }
      const cssMap: Record<string, string> = {
        inscription:            'card-status status-oneshot-inscription',
        fermeture_inscriptions: 'card-status status-oneshot-fermee',
        vote:                   'card-status status-oneshot-vote',
        resultats:              'card-status status-passee',
      };
      return { text: ONESHOT_STATUT_LABELS[o.statut], css: cssMap[o.statut] ?? 'card-status' };
    }
    const statut = getDefiStatut(data as Defi);
    if (statut === 'a_venir') {
      const debut = (data as Defi).dateDebutSoumission;
      return this.isDateWithin7Days(debut)
        ? { text: 'Bientôt',  css: 'card-status status-bientot' }
        : { text: 'À venir',  css: 'card-status status-avenir' };
    }
    const cssMap: Record<string, string> = {
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

  private isDateWithin7Days(date: string): boolean {
    const n = new Date();
    const todayStr = `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    if (date < todayStr) return false;
    const limit = new Date(n);
    limit.setDate(limit.getDate() + 7);
    const y = limit.getFullYear();
    const m = String(limit.getMonth() + 1).padStart(2, '0');
    const d = String(limit.getDate()).padStart(2, '0');
    return date <= `${y}-${m}-${d}`;
  }
}
