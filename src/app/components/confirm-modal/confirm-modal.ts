import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { ConfirmService } from '../../services/confirm.service';

@Component({
  selector: 'app-confirm-modal',
  imports: [],
  templateUrl: './confirm-modal.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './confirm-modal.css',
})
export class ConfirmModal {
  protected confirmService = inject(ConfirmService);
}
