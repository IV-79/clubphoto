import { Component, inject, signal, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { PartenairesService } from '../../../services/partenaires.service';
import { Partenaire } from '../../../models/partenaire.model';

@Component({
  selector: 'app-partenaires',
  imports: [],
  templateUrl: './partenaires.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './partenaires.css',
})
export class Partenaires implements OnInit {
  private service = inject(PartenairesService);

  partenaires = signal<Partenaire[]>([]);
  loading = signal(true);

  async ngOnInit() {
    const all = await firstValueFrom(this.service.getPartenaires());
    this.partenaires.set(all.filter((p) => p.actif));
    this.loading.set(false);
  }
}
