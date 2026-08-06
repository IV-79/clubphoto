import { Component, inject, OnInit, signal, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { isSignInWithEmailLink, signInWithEmailLink, updatePassword } from 'firebase/auth';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { auth, db } from '../../utils/firebase';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { UserProfile } from '../../models/user.model';

type Step = 'checking' | 'invalid' | 'needEmail' | 'form' | 'saving' | 'done';

@Component({
  selector: 'app-completer-profil',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './completer-profil.component.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrls: ['./completer-profil.component.css'],
})
export class CompleterProfilComponent implements OnInit {
  private router = inject(Router);

  step = signal<Step>('checking');
  errorMessage = signal('');

  confirmedEmail = '';
  nom = '';
  prenom = '';
  password = '';
  passwordConfirm = '';

  private signedInEmail = '';

  async ngOnInit() {
    if (!isSignInWithEmailLink(auth, window.location.href)) {
      this.step.set('invalid');
      return;
    }

    const stored = window.localStorage.getItem('emailForSignIn');
    if (stored) {
      await this.signInWithEmail(stored);
    } else {
      this.step.set('needEmail');
    }
  }

  async confirmEmail() {
    if (!this.confirmedEmail) return;
    await this.signInWithEmail(this.confirmedEmail);
  }

  private async signInWithEmail(email: string) {
    try {
      const result = await signInWithEmailLink(auth, email, window.location.href);
      window.localStorage.removeItem('emailForSignIn');
      this.signedInEmail = result.user.email ?? email;

      // If a Firestore profile already exists, redirect
      const snap = await getDoc(doc(db, 'users', result.user.uid));
      if (snap.exists()) {
        this.router.navigate(['/membre/portfolio']);
        return;
      }

      this.step.set('form');
    } catch {
      this.errorMessage.set('Lien invalide ou expiré. Demandez une nouvelle invitation.');
      this.step.set('invalid');
    }
  }

  async saveProfile() {
    if (!this.nom || !this.password || this.password !== this.passwordConfirm) {
      this.errorMessage.set(
        'Veuillez remplir tous les champs et vérifier que les mots de passe correspondent.',
      );
      return;
    }
    if (this.password.length < 6) {
      this.errorMessage.set('Le mot de passe doit contenir au moins 6 caractères.');
      return;
    }

    this.step.set('saving');
    this.errorMessage.set('');

    try {
      const user = auth.currentUser!;
      await updatePassword(user, this.password);

      const profile: UserProfile = {
        uid: user.uid,
        email: this.signedInEmail,
        nom: this.nom,
        prenom: this.prenom || undefined,
        role: 'membre',
        dateAdhesion: new Date().toISOString().split('T')[0],
      };
      await setDoc(doc(db, 'users', user.uid), profile);

      this.step.set('done');
      setTimeout(() => this.router.navigate(['/membre/portfolio']), 2000);
    } catch {
      this.errorMessage.set('Une erreur est survenue. Veuillez réessayer.');
      this.step.set('form');
    }
  }
}
