import { Component, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatChipsModule } from '@angular/material/chips';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { toSignal } from '@angular/core/rxjs-interop';
import { Auth } from '@angular/fire/auth';
import { AuthService } from '../../../services/auth.service';
import { ConfirmService } from '../../../services/confirm.service';
import { UserProfile } from '../../../models/user.model';

@Component({
  selector: 'app-membres',
  imports: [
    FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatTableModule,
    MatChipsModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatTooltipModule, MatProgressSpinnerModule,
  ],
  templateUrl: './membres.html',
  styleUrl: './membres.css',
})
export class Membres {
  private authService = inject(AuthService);
  private confirmService = inject(ConfirmService);
  private snackBar = inject(MatSnackBar);
  private auth = inject(Auth);

  currentUid = signal(this.auth.currentUser?.uid ?? '');

  readonly roles = ['admin', 'membre'];

  membres = toSignal(this.authService.getAllMembers(), { initialValue: [] as UserProfile[] });
  filterText = signal('');
  loadingUid = signal<string | null>(null);

  inviteEmail = '';
  inviteLoading = signal(false);
  inviteSuccess = signal('');
  inviteError = signal('');

  filteredMembres = computed(() => {
    const q = this.filterText().toLowerCase().trim();
    if (!q) return this.membres();
    return this.membres().filter(m =>
      m.nom.toLowerCase().includes(q) ||
      m.email.toLowerCase().includes(q)
    );
  });

  displayedColumns = ['nom', 'email', 'role', 'statut', 'dateAdhesion', 'actions'];

  async changeRole(membre: UserProfile, newRole: string) {
    if (newRole === membre.role) return;
    this.loadingUid.set(membre.uid);
    try {
      await this.authService.changeMemberRole(membre.uid, newRole);
      this.snackBar.open(`Rôle changé → ${newRole}`, '', { duration: 3000 });
    } catch {
      this.snackBar.open('Erreur lors du changement de rôle', '', { duration: 3000 });
    } finally {
      this.loadingUid.set(null);
    }
  }

  async toggleSuspend(membre: UserProfile) {
    this.loadingUid.set(membre.uid);
    try {
      await this.authService.suspendMember(membre.uid, !membre.isSuspended);
      this.snackBar.open(
        membre.isSuspended ? 'Compte réactivé' : 'Compte suspendu',
        '', { duration: 3000 }
      );
    } catch {
      this.snackBar.open('Erreur lors de la mise à jour', '', { duration: 3000 });
    } finally {
      this.loadingUid.set(null);
    }
  }

  async sendInvite() {
    if (!this.inviteEmail.trim()) return;
    this.inviteLoading.set(true);
    this.inviteSuccess.set('');
    this.inviteError.set('');
    try {
      await this.authService.inviteMember(this.inviteEmail.trim());
      this.inviteSuccess.set(`Invitation envoyée à ${this.inviteEmail.trim()}`);
      this.inviteEmail = '';
    } catch {
      this.inviteError.set('Erreur lors de l\'envoi. Vérifiez l\'adresse email.');
    } finally {
      this.inviteLoading.set(false);
    }
  }

  async requestDelete(membre: UserProfile) {
    const ok = await this.confirmService.confirm(
      `Supprimer ${membre.nom} ? Toutes ses photos et son profil seront effacés définitivement.`,
      'Supprimer le membre'
    );
    if (!ok) return;
    this.loadingUid.set(membre.uid);
    try {
      await this.authService.deleteMemberData(membre.uid);
      this.snackBar.open('Membre supprimé', '', { duration: 3000 });
    } catch (e) {
      console.error('deleteMemberData error:', e);
      this.snackBar.open('Erreur lors de la suppression', '', { duration: 4000 });
    } finally {
      this.loadingUid.set(null);
    }
  }
}
