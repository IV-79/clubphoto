import { inject } from '@angular/core';
import { CanDeactivateFn } from '@angular/router';
import { ConfirmService } from '../services/confirm.service';

export interface HasUnsavedEval {
  evaluationDraftDirtyFn: () => boolean;
}

export const unsavedEvalGuard: CanDeactivateFn<HasUnsavedEval> = async (component) => {
  if (!component.evaluationDraftDirtyFn()) return true;
  const confirmService = inject(ConfirmService);
  const choice = await confirmService.confirmTriple(
    'Vous avez modifié un classement sans le sauvegarder. Les modifications seront perdues si vous quittez la page.',
    'Classement non sauvegardé',
    'Rester sur la page',
    'Quitter sans sauvegarder',
  );
  if (choice === 'primary') return false;   // rester
  if (choice === 'secondary') return true;  // quitter sans sauvegarder
  return false;                             // annuler = rester
};
