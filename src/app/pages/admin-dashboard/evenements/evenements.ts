import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-evenements',
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './evenements.html',
  styleUrl: './evenements.css',
})
export class Evenements {
  evenements: any[] = [];
}
