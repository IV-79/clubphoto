import { Component } from '@angular/core';
import { RouterOutlet, RouterLink } from '@angular/router';

@Component({
  selector: 'app-le-club',
  imports: [RouterOutlet],
  template: `<router-outlet />`
})
export class LeClub {}

@Component({
  selector: 'app-histoire',
  imports: [],
  template: `<div class="page-wrap"><h1>Histoire du club</h1><p>Contenu à venir...</p></div>`,
  styles: [`.page-wrap{max-width:900px;margin:40px auto;padding:0 24px}h1{color:#1a237e;border-bottom:3px solid #ffb300;padding-bottom:8px;display:inline-block}`]
})
export class Histoire {}

@Component({
  selector: 'app-bureau',
  imports: [],
  template: `<div class="page-wrap"><h1>Le Bureau</h1><p>Contenu à venir...</p></div>`,
  styles: [`.page-wrap{max-width:900px;margin:40px auto;padding:0 24px}h1{color:#1a237e;border-bottom:3px solid #ffb300;padding-bottom:8px;display:inline-block}`]
})
export class Bureau {}

@Component({
  selector: 'app-adhesion',
  imports: [],
  template: `<div class="page-wrap"><h1>Adhésion</h1><p>Contenu à venir...</p></div>`,
  styles: [`.page-wrap{max-width:900px;margin:40px auto;padding:0 24px}h1{color:#1a237e;border-bottom:3px solid #ffb300;padding-bottom:8px;display:inline-block}`]
})
export class Adhesion {}
