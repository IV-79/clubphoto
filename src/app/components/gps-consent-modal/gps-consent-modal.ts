import { Component, inject } from '@angular/core';
import { GpsConsentService } from '../../services/gps-consent.service';

@Component({
  selector: 'app-gps-consent-modal',
  imports: [],
  templateUrl: './gps-consent-modal.html',
  styleUrl: './gps-consent-modal.css',
})
export class GpsConsentModal {
  protected gpsService = inject(GpsConsentService);
}
