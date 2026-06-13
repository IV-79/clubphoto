import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-guide',
  imports: [RouterLink, MatIconModule],
  templateUrl: './guide.html',
  styleUrl: './guide.css',
})
export class MembresGuide {
  scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  }
}
