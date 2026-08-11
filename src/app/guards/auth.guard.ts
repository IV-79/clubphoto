import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';
import { LoginModalService } from '../services/login-modal.service';
import { auth } from '../utils/firebase';
import { from, switchMap, map, take, of } from 'rxjs';

export const authGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const loginModal = inject(LoginModalService);

  return from(auth.authStateReady()).pipe(
    switchMap(() => authService.user$.pipe(take(1))),
    switchMap(user => {
      if (!user) {
        loginModal.open(state.url);
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

export const editorGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const loginModal = inject(LoginModalService);

  return from(auth.authStateReady()).pipe(
    switchMap(() => authService.user$.pipe(take(1))),
    switchMap(user => {
      if (!user) {
        loginModal.open(state.url);
        return of(false);
      }
      return from(authService.getUserRole()).pipe(
        map(role => {
          if (role === 'admin' || role === 'contributeur') return true;
          router.navigate(['/']);
          return false;
        })
      );
    })
  );
};

export const memberGuard: CanActivateFn = (route, state) => {
  const authService = inject(AuthService);
  const loginModal = inject(LoginModalService);

  return from(auth.authStateReady()).pipe(
    switchMap(() => authService.user$.pipe(take(1))),
    map(user => {
      if (!user) {
        loginModal.open(state.url);
        return false;
      }
      return true;
    })
  );
};
