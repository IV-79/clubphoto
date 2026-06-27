import {
  Component, Input, Output, EventEmitter,
  signal, computed, HostListener, ElementRef, inject, forwardRef,
} from '@angular/core';
import { ControlValueAccessor, NG_VALUE_ACCESSOR } from '@angular/forms';

type DPView = 'day' | 'month' | 'year';

interface Day {
  ymd: string;
  n: number;
  current: boolean;
  weekend: boolean;
  today: boolean;
  selected: boolean;
  disabled: boolean;
}

const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MOIS_COURT = ['Janv','Févr','Mars','Avr','Mai','Juin','Juil','Août','Sept','Oct','Nov','Déc'];
const JOURS = ['Lun','Mar','Mer','Jeu','Ven','Sam','Dim'];

function toYMD(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [],
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.css',
  providers: [{ provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => DatePickerComponent), multi: true }],
})
export class DatePickerComponent implements ControlValueAccessor {
  private el = inject(ElementRef);

  @Input() label    = '';
  @Input() required = false;
  @Input() placeholder = 'JJ/MM/AAAA';
  @Input() min = '';
  @Input() max = '';

  @Input() set value(v: string) { this._applyValue(v ?? ''); }
  @Output() valueChange = new EventEmitter<string>();

  readonly MOIS       = MOIS;
  readonly MOIS_COURT = MOIS_COURT;
  readonly JOURS      = JOURS;
  readonly _today     = toYMD(new Date());

  _val      = signal('');
  _open     = signal(false);
  _view     = signal<DPView>('day');
  _year     = signal(new Date().getFullYear());
  _month    = signal(new Date().getMonth());
  _yStart   = signal(Math.floor(new Date().getFullYear() / 12) * 12);
  _disabled = signal(false);

  get displayValue(): string {
    const v = this._val();
    if (!v) return '';
    const [y, m, d] = v.split('-');
    return `${d}/${m}/${y}`;
  }

  get monthLabel(): string { return MOIS[this._month()]; }

  get yearRange(): number[] {
    return Array.from({ length: 12 }, (_, i) => this._yStart() + i);
  }

  days = computed((): Day[] => {
    const yr = this._year(), mo = this._month();
    const sel = this._val(), td = this._today;
    const mn = this.min, mx = this.max;
    const offset = (new Date(yr, mo, 1).getDay() + 6) % 7; // Monday = 0
    return Array.from({ length: 42 }, (_, i) => {
      const d = new Date(yr, mo, i - offset + 1);
      const ymd = toYMD(d);
      const dow = d.getDay();
      return {
        ymd, n: d.getDate(),
        current: d.getMonth() === mo,
        weekend: dow === 0 || dow === 6,
        today: ymd === td,
        selected: ymd === sel,
        disabled: (!!mn && ymd < mn) || (!!mx && ymd > mx),
      };
    });
  });

  private _onChange:  (v: string) => void = () => {};
  private _onTouched: () => void          = () => {};

  writeValue(v: string): void { this._applyValue(v ?? ''); }
  registerOnChange(fn: (v: string) => void): void { this._onChange = fn; }
  registerOnTouched(fn: () => void): void { this._onTouched = fn; }
  setDisabledState(d: boolean): void { this._disabled.set(d); }

  private _applyValue(v: string): void {
    this._val.set(v);
    if (v) {
      const d = new Date(v + 'T12:00:00');
      this._year.set(d.getFullYear());
      this._month.set(d.getMonth());
    }
  }

  toggle(): void {
    if (this._disabled()) return;
    if (!this._open()) {
      this._view.set('day');
      const v = this._val();
      const base = v ? new Date(v + 'T12:00:00') : new Date();
      this._year.set(base.getFullYear());
      this._month.set(base.getMonth());
    }
    this._open.set(!this._open());
    if (!this._open()) { this._onTouched(); }
  }

  pick(day: Day): void {
    if (day.disabled) return;
    this._val.set(day.ymd);
    this._onChange(day.ymd);
    this.valueChange.emit(day.ymd);
    this._onTouched();
    this._open.set(false);
  }

  pickMonth(m: number): void { this._month.set(m); this._view.set('day'); }

  pickYear(y: number): void {
    this._year.set(y);
    this._yStart.set(Math.floor(y / 12) * 12);
    this._view.set('month');
  }

  prev(): void {
    if (this._view() === 'day') {
      if (this._month() === 0) { this._month.set(11); this._year.update(y => y - 1); }
      else this._month.update(m => m - 1);
    } else if (this._view() === 'month') {
      this._year.update(y => y - 1);
    } else {
      this._yStart.update(s => s - 12);
    }
  }

  next(): void {
    if (this._view() === 'day') {
      if (this._month() === 11) { this._month.set(0); this._year.update(y => y + 1); }
      else this._month.update(m => m + 1);
    } else if (this._view() === 'month') {
      this._year.update(y => y + 1);
    } else {
      this._yStart.update(s => s + 12);
    }
  }

  toMonths(): void { this._view.set('month'); }
  toYears():  void { this._yStart.set(Math.floor(this._year() / 12) * 12); this._view.set('year'); }

  @HostListener('document:click', ['$event'])
  onDocClick(e: MouseEvent): void {
    if (this._open() && !this.el.nativeElement.contains(e.target as Node)) {
      this._open.set(false);
      this._onTouched();
    }
  }

  @HostListener('document:keydown.escape')
  onEscape(): void { if (this._open()) this._open.set(false); }
}
