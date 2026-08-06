import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { GpsConsentService } from '../../services/gps-consent.service';

@Component({
  selector: 'app-gps-consent-modal',
  imports: [MatIconModule],
  templateUrl: './gps-consent-modal.html',
  changeDetection: ChangeDetectionStrategy.Eager,
  styleUrl: './gps-consent-modal.css',
})
export class GpsConsentModal {
  protected gpsService = inject(GpsConsentService);
}
