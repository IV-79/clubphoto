import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth } from '@angular/fire/auth';
import { AuthService } from '../services/auth.service';
import { from, switchMap, map, take, of } from 'rxjs';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const auth = inject(Auth);

  // Attendre que Firebase ait résolu l'état de session persisté
  return from(auth.authStateReady()).pipe(
    switchMap(() => authService.user$.pipe(take(1))),
    switchMap(user => {
      if (!user) {
        router.navigate(['/login']);
        return of(false);
      }
      return from(authService.getUserRole()).pipe(
        map(role => {
          if (role === 'admin') return true;
          router.navigate(['/']);
          return false;
        })
      );
    })
  );
};

export const loginGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const auth = inject(Auth);

  return from(auth.authStateReady()).pipe(
    switchMap(() => authService.user$.pipe(take(1))),
    map(user => {
      if (user) {
        router.navigate(['/admin']);
        return false;
      }
      return true;
    })
  );
};
