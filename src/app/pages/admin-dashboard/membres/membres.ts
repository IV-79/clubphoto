import { Component, inject } from '@angular/core';
import { AsyncPipe } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { AuthService } from '../../../services/auth.service';

@Component({
  selector: 'app-membres',
  imports: [AsyncPipe, MatCardModule, MatButtonModule, MatIconModule, MatTableModule, MatChipsModule],
  templateUrl: './membres.html',
  styleUrl: './membres.css',
})
export class Membres {
  private authService = inject(AuthService);

  displayedColumns = ['nom', 'email', 'role', 'dateAdhesion'];
  membres$ = this.authService.getAllMembers();
}
