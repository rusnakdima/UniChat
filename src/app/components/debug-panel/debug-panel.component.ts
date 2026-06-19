/* sys lib */
import { Component, inject, signal, computed, OnInit, OnDestroy } from "@angular/core";

/* services */
import { ConnectionStateService } from "@services/data/connection-state.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { LOGGER_SERVICE } from "@core/services/logger.service";
import { ChatListService } from "@services/data/chat-list.service";
import { ThemeService } from "@services/core/theme.service";
import { buildChannelRef } from "@utils/channel-ref.util";
import { ACTIVITY_TRACKING_INTERVAL_MS } from "@shared/utils/constants";

interface ActivityEntry {
  time: string;
  type: "timer" | "connection" | "parsing" | "error";
  message: string;
}

@Component({
  selector: "app-debug-panel",
  standalone: true,
  imports: [],
  template: `
    <div
      class="fixed z-50 box-border rounded-xl border shadow-xl select-none"
      [class.bg-white]="themeMode() === 'light'"
      [class.text-zinc-900]="themeMode() === 'light'"
      [class.border-zinc-200]="themeMode() === 'light'"
      [class.bg-zinc-900]="themeMode() === 'dark'"
      [class.text-zinc-100]="themeMode() === 'dark'"
      [class.border-zinc-700]="themeMode() === 'dark'"
      [style.left.px]="position().x"
      [style.top.px]="position().y"
      [style.width.px]="size().width"
      [style.height.px]="isOpen() ? size().height : 44"
    >
      <div
        class="flex cursor-move items-center justify-between border-b p-3"
        [class.border-zinc-200]="themeMode() === 'light'"
        [class.border-zinc-700]="themeMode() === 'dark'"
        [class.bg-zinc-50]="themeMode() === 'light'"
        [class.bg-zinc-800]="themeMode() === 'dark'"
        (mousedown)="onHeaderMouseDown($event)"
      >
        <h3 class="text-sm font-semibold">Debug Panel</h3>
        <button
          type="button"
          class="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-zinc-200 dark:hover:bg-zinc-700"
          [class.text-zinc-600]="themeMode() === 'light'"
          [class.text-zinc-400]="themeMode() === 'dark'"
          (click)="toggle($event)"
        >
          {{ isOpen() ? "−" : "+" }}
        </button>
      </div>

      @if (isOpen()) {
        <div class="overflow-y-auto p-3" [style.height.px]="size().height - 44">
          <div class="space-y-3">
            <!-- Connections Section -->
            <div>
              <div class="mb-1 flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-blue-500"></span>
                <span class="text-[10px] font-semibold tracking-wide uppercase">Connections</span>
              </div>
              <div class="ml-4 space-y-1">
                @for (conn of connections(); track conn.channelId) {
                  <div class="border-l-2 border-zinc-300 pl-2 text-xs dark:border-zinc-600">
                    <div class="font-medium">{{ conn.channelId }}</div>
                    <div class="text-zinc-500 dark:text-zinc-400">Status: {{ conn.status }}</div>
                    @if (conn.error) {
                      <div class="text-[10px] text-red-500">Error: {{ conn.error.code }}</div>
                    }
                  </div>
                }
                @if (connections().length === 0) {
                  <div class="text-xs text-zinc-400">No active connections</div>
                }
              </div>
            </div>

            <!-- Accounts Section -->
            <div>
              <div class="mb-1 flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-amber-500"></span>
                <span class="text-[10px] font-semibold tracking-wide uppercase">Accounts</span>
              </div>
              <div class="ml-4 space-y-1">
                @for (acc of accounts(); track acc.id) {
                  <div class="border-l-2 border-zinc-300 pl-2 text-xs dark:border-zinc-600">
                    <div class="font-medium">{{ acc.platform }} - {{ acc.username }}</div>
                    <div class="text-zinc-500 dark:text-zinc-400">Status: {{ acc.authStatus }}</div>
                  </div>
                }
                @if (accounts().length === 0) {
                  <div class="text-xs text-zinc-400">No authorized accounts</div>
                }
              </div>
            </div>

            <!-- Activity Log Section -->
            <div>
              <div class="mb-1 flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
                <span class="text-[10px] font-semibold tracking-wide uppercase">Activity Log</span>
              </div>
              <div class="ml-4 max-h-32 space-y-1 overflow-y-auto">
                @for (entry of activityLog(); track entry.time + entry.message) {
                  <div class="flex gap-2 text-[10px]">
                    <span class="shrink-0 text-zinc-400">{{ entry.time }}</span>
                    <span
                      class="mt-1 h-1.5 w-1.5 shrink-0 rounded-full"
                      [class.bg-blue-500]="entry.type === 'connection'"
                      [class.bg-emerald-500]="entry.type === 'timer'"
                      [class.bg-purple-500]="entry.type === 'parsing'"
                      [class.bg-red-500]="entry.type === 'error'"
                    ></span>
                    <span class="text-zinc-600 dark:text-zinc-300">{{ entry.message }}</span>
                  </div>
                }
                @if (activityLog().length === 0) {
                  <div class="text-xs text-zinc-400">No activity recorded</div>
                }
              </div>
            </div>

            <!-- Stats Section -->
            <div>
              <div class="mb-1 flex items-center gap-2">
                <span class="h-2 w-2 rounded-full bg-purple-500"></span>
                <span class="text-[10px] font-semibold tracking-wide uppercase">Stats</span>
              </div>
              <div class="ml-4 grid grid-cols-2 gap-2 text-[10px]">
                <div class="text-zinc-500">Messages:</div>
                <div class="font-medium">{{ messageCount() }}</div>
                <div class="text-zinc-500">Timers:</div>
                <div class="font-medium">{{ activeTimerCount() }}</div>
              </div>
            </div>
          </div>
        </div>
      }

      <div
        class="absolute right-0 bottom-0 flex h-6 w-6 cursor-se-resize items-center justify-center rounded-br-xl text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300"
        [class.bg-zinc-100]="themeMode() === 'light'"
        [class.bg-zinc-800]="themeMode() === 'dark'"
        [style.display]="isOpen() ? 'flex' : 'none'"
        (mousedown)="onResizeStart($event)"
      >
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M2 12 L12 2 M4 12 L12 4" stroke="currentColor" stroke-width="2" fill="none" />
        </svg>
      </div>
    </div>
  `,
  host: {
    class: "block",
  },
})
export class DebugPanelComponent implements OnInit, OnDestroy {
  private readonly connectionState = inject(ConnectionStateService);
  private readonly authService = inject(AuthorizationService);
  private readonly logger = inject(LOGGER_SERVICE);
  private readonly chatList = inject(ChatListService);
  private readonly themeService = inject(ThemeService);

  readonly isOpen = signal(false);
  readonly debugEnabled = signal(false);
  readonly position = signal({ x: 16, y: 16 });
  readonly size = signal({ width: 320, height: 280 });
  readonly activityLog = signal<ActivityEntry[]>([]);
  readonly messageCount = signal(0);
  readonly activeTimerCount = signal(0);

  private isDragging = false;
  private isResizing = false;
  private dragStart = { x: 0, y: 0 };
  private panelStart = { x: 0, y: 0 };
  private initialSize = { width: 320, height: 280 };
  private logIntervalId: ReturnType<typeof setInterval> | null = null;

  readonly connections = computed(() => this.connectionState.connections());
  readonly accounts = computed(() => this.authService.accounts());
  readonly themeMode = this.themeService.themeMode;

  ngOnInit(): void {
    const savedSize = localStorage.getItem("debug-panel-size");
    if (savedSize) {
      try {
        const parsed = JSON.parse(savedSize);
        this.size.set({ width: parsed.width, height: parsed.height });
      } catch {}
    }

    const savedState = localStorage.getItem("debug-panel-open");
    if (savedState !== null) {
      this.isOpen.set(savedState === "true");
    }

    this.startActivityTracking();
  }

  private startActivityTracking(): void {
    this.logIntervalId = setInterval(() => {
      const now = new Date();
      const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

      const connCount = this.connections().length;
      const accCount = this.accounts().length;

      if (connCount > 0) {
        this.addActivityEntry(
          "connection",
          `Active: ${connCount} connection${connCount > 1 ? "s" : ""}`
        );
      }

      if (accCount > 0) {
        this.addActivityEntry("timer", `Authorized: ${accCount} account${accCount > 1 ? "s" : ""}`);
      }

      this.activeTimerCount.set(3);
    }, ACTIVITY_TRACKING_INTERVAL_MS);
  }

  private addActivityEntry(type: ActivityEntry["type"], message: string): void {
    const now = new Date();
    const time = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}:${now.getSeconds().toString().padStart(2, "0")}`;

    this.activityLog.update((log) => {
      const newLog = [...log, { time, type, message }];
      if (newLog.length > 20) {
        return newLog.slice(-20);
      }
      return newLog;
    });
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen.update((v) => !v);
    localStorage.setItem("debug-panel-open", String(this.isOpen()));
    if (this.isOpen() && this.size().height < 200) {
      this.size.set({ width: this.size().width, height: 280 });
    }
  }

  onHeaderMouseDown(event: MouseEvent): void {
    event.preventDefault();
    this.isDragging = true;
    this.dragStart = { x: event.clientX, y: event.clientY };
    this.panelStart = { ...this.position() };
    document.addEventListener("mousemove", this.onMouseMove);
    document.addEventListener("mouseup", this.onMouseUp);
  }

  onResizeStart(event: MouseEvent): void {
    event.stopPropagation();
    this.isResizing = true;
    this.initialSize = { ...this.size() };
    this.dragStart = { x: event.clientX, y: event.clientY };
    document.addEventListener("mousemove", this.onResizeMove);
    document.addEventListener("mouseup", this.onResizeEnd);
  }

  private onMouseMove = (event: MouseEvent): void => {
    if (!this.isDragging) return;
    const dx = event.clientX - this.dragStart.x;
    const dy = event.clientY - this.dragStart.y;
    this.position.update((pos) => ({
      x: this.panelStart.x + dx,
      y: this.panelStart.y + dy,
    }));
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
  };

  private onResizeMove = (event: MouseEvent): void => {
    if (!this.isResizing) return;
    const dw = event.clientX - this.dragStart.x;
    const dh = event.clientY - this.dragStart.y;
    this.size.update((s) => ({
      width: Math.max(280, this.initialSize.width + dw),
      height: Math.max(200, this.initialSize.height + dh),
    }));
    localStorage.setItem("debug-panel-size", JSON.stringify(this.size()));
  };

  private onResizeEnd = (): void => {
    this.isResizing = false;
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
  };

  clearErrors(): void {
    for (const conn of this.connections()) {
      const channelRef = buildChannelRef(conn.platform, conn.channelId);
      this.connectionState.clearError(channelRef);
    }
  }

  ngOnDestroy(): void {
    if (this.logIntervalId) {
      clearInterval(this.logIntervalId);
    }
    document.removeEventListener("mousemove", this.onMouseMove);
    document.removeEventListener("mouseup", this.onMouseUp);
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
  }
}
