import { Injectable, inject } from "@angular/core";
import { invoke } from "@tauri-apps/api/core";
import { LoggingService } from "@app/shared/services/logging.service";

const DEFAULT_TIMEOUT_MS = 30000;

export interface InvokeOptions {
  timeoutMs?: number;
  suppressError?: boolean;
}

interface TauriResponse<T> {
  status: "success" | "error";
  data: T;
  message?: string;
}

@Injectable({ providedIn: "root" })
export class TauriApiService {
  private readonly logger = inject(LoggingService);

  async invoke<T>(
    command: string,
    args?: Record<string, unknown>,
    options: InvokeOptions = {}
  ): Promise<T> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    try {
      const response = await Promise.race([
        invoke<TauriResponse<T>>(command, args),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error(`Command "${command}" timed out after ${timeoutMs}ms`)),
            timeoutMs
          )
        ),
      ]);
      if (response.status === "success") {
        return response.data as T;
      } else {
        throw new Error(response.message || `Operation failed: ${command}`);
      }
    } catch (error: unknown) {
      if (!options.suppressError) {
        this.logger.error("TauriApiService", `Error invoking command "${command}":`, error);
      }
      throw error;
    }
  }
}
