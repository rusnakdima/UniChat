import { Injectable } from "@angular/core";

export type StorageValidator<T> = (value: unknown) => value is T;

@Injectable({
  providedIn: "root",
})
export class LocalStorageService {
  get<T>(key: string, defaultValue: T, validator?: StorageValidator<T>): T {
    const storedValue = localStorage.getItem(key);

    if (!storedValue) {
      return defaultValue;
    }

    try {
      const parsed = JSON.parse(storedValue);

      if (validator && validator(parsed)) {
        return parsed;
      }

      if (!validator) {
        return parsed as T;
      }

      return defaultValue;
    } catch {
      return defaultValue;
    }
  }

  set<T>(key: string, value: T): void {
    localStorage.setItem(key, JSON.stringify(value));
  }

  remove(key: string): void {
    localStorage.removeItem(key);
  }

  has(key: string): boolean {
    return localStorage.getItem(key) !== null;
  }
}
