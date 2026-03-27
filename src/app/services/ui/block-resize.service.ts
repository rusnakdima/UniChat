import { Injectable, signal, computed } from "@angular/core";

@Injectable({
  providedIn: "root",
})
export class BlockResizeService {
  private readonly STORAGE_KEY = "unichat-block-widths";

  private readonly blockWidths = signal<Map<string, number>>(new Map());

  readonly widths = computed(() => this.blockWidths());

  constructor() {
    this.loadFromStorage();
  }

  setBlockWidth(id: string, width: number): void {
    const current = new Map(this.blockWidths());
    current.set(id, Math.max(10, Math.min(100, width)));
    this.blockWidths.set(current);
    this.saveToStorage();
  }

  /**
   * Resize two adjacent blocks proportionally.
   * The total combined width stays constant - only the distribution changes.
   * @param idLeft - The left block's platform ID
   * @param idRight - The right block's platform ID
   * @param newLeftWidth - The new width percentage for the left block (of total container)
   * @param totalShared - The total combined width percentage these two blocks should occupy
   */
  resizePair(idLeft: string, idRight: string, newLeftWidth: number, totalShared: number): void {
    const current = new Map(this.blockWidths());

    // Ensure minimum width of 5% for each block
    const clampedLeftWidth = Math.max(5, Math.min(totalShared - 5, newLeftWidth));
    const rightWidth = totalShared - clampedLeftWidth;

    current.set(idLeft, clampedLeftWidth);
    current.set(idRight, rightWidth);

    this.blockWidths.set(current);
    this.saveToStorage();
  }

  getBlockWidth(id: string): number | null {
    return this.blockWidths().get(id) ?? null;
  }

  resetWidths(): void {
    this.blockWidths.set(new Map());
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored) as Record<string, number>;
        const map = new Map<string, number>(Object.entries(parsed));
        this.blockWidths.set(map);
      }
    } catch {
      // Ignore errors, use defaults
    }
  }

  private saveToStorage(): void {
    const obj = Object.fromEntries(this.blockWidths());
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(obj));
  }
}
