import { Injectable } from '@angular/core';

@Injectable({ providedIn: 'root' })
export class GlobalErrorHandler {
  handleError(error: unknown): void { console.error(error); }
}
