import { Component, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { switchMap } from 'rxjs';
import { AuthService } from '../../../services/auth.service';
import { PhotoService } from '../../../services/photo.service';
import { Photo } from '../../../models/photo.model';

@Component({
  selector: 'app-membre-detail',
  imports: [RouterLink],
  templateUrl: './membre-detail.html',
  styleUrl: './membre-detail.css',
})
export class MembreDetail {
  private route = inject(ActivatedRoute);
  private authService = inject(AuthService);
  private photoService = inject(PhotoService);

  membre = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.authService.getMemberProfile(p.get('uid')!))
    )
  );

  photos = toSignal(
    this.route.paramMap.pipe(
      switchMap(p => this.photoService.getPublicPhotos(p.get('uid')!))
    ),
    { initialValue: [] as Photo[] }
  );
}
