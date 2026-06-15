import { Component } from '@angular/core';
import { MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-suspendu-dialog',
  imports: [MatDialogModule, MatButtonModule, MatIconModule],
  template: `
    <div class="dialog-header">
      <mat-icon class="warning-icon">block</mat-icon>
      <h2 mat-dialog-title>Compte suspendu</h2>
    </div>
    <mat-dialog-content>
      <p>Votre compte a été suspendu par un administrateur.</p>
      <p>Veuillez contacter le club pour plus d'informations.</p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-raised-button color="warn" mat-dialog-close>Fermer</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .dialog-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 24px 24px 0;
    }
    .warning-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
      color: #c62828;
    }
    h2[mat-dialog-title] {
      margin: 0;
      font-size: 1.3rem;
    }
    mat-dialog-content p {
      margin: 8px 0;
      color: #444;
    }
  `]
})
export class SuspenduDialogComponent {}
