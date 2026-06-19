import { Injectable } from "@angular/core";

export interface SessionExportOptions {
  format: "json" | "csv" | "txt";
  includeMessages: boolean;
  dateRange?: { start: Date; end: Date };
}

export interface SessionExportPreview {
  count: number;
  platforms?: string[];
}

@Injectable({ providedIn: "root" })
export class SessionExportService {
  export(options: SessionExportOptions): Promise<Blob> {
    return Promise.resolve(new Blob());
  }
  getExportPreview(options: SessionExportOptions): Promise<SessionExportPreview> {
    return Promise.resolve({ count: 0 });
  }
}
