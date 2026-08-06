import { Component, computed, input, output, signal, ChangeDetectionStrategy } from '@angular/core';

export interface RankingItem {
  id: string;
  url: string;
  authorName: string;
  votes: number;
}

@Component({
  selector: 'app-vote-ranking',
  standalone: true,
  templateUrl: './vote-ranking.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './vote-ranking.css',
})
export class VoteRankingComponent {
  items = input.required<RankingItem[]>();
  showVotes = input<boolean>(true);

  itemClicked = output<string>();

  rankMap = computed((): Map<string, number> => {
    const all = this.items();
    return new Map(
      all.map((item) => {
        const rank = all.filter((q) => q.votes > item.votes).length + 1;
        return [item.id, rank];
      }),
    );
  });

  podiumItems = computed(() =>
    this.items().filter((item) => (this.rankMap().get(item.id) ?? 99) <= 3),
  );

  suiteItems = computed(() =>
    this.items().filter((item) => (this.rankMap().get(item.id) ?? 99) > 3),
  );

  suiteVisible = signal(false);

  medalEmoji(rank: number): string {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    return '🥉';
  }
}
