import { Component } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-galeries',
  imports: [MatCardModule, MatButtonModule, MatIconModule],
  templateUrl: './galeries.html',
  styleUrl: './galeries.css',
})
export class Galeries {
  galeries: any[] = [];
}
