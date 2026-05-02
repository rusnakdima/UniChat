/* sys lib */
import { Component, inject, signal, computed, OnInit } from "@angular/core";

/* services */
import { ConnectionStateService } from "@services/data/connection-state.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { LoggerService } from "@services/core/logger.service";
import { ChatListService } from "@services/data/chat-list.service";
import { buildChannelRef } from "@utils/channel-ref.util";

@Component({
  selector: "app-debug-panel",
  standalone: true,
  imports: [],
  template: `
    <div
      class="fixed box-border rounded-lg bg-gray-900 text-xs text-white opacity-90 shadow-xl select-none"
      [style.left.px]="position().x"
      [style.top.px]="position().y"
      [style.width.px]="size().width"
      [style.height.px]="isOpen() ? size().height : 44"
    >
      <div
        class="flex cursor-move items-center justify-between p-3"
        (mousedown)="onHeaderMouseDown($event)"
      >
        <h3 class="text-sm font-bold">Debug Panel</h3>
        <button
          class="px-2 text-2xl leading-none text-gray-400 hover:text-white"
          (click)="toggle($event)"
        >
          {{ isOpen() ? "−" : "+" }}
        </button>
      </div>

      @if (isOpen()) {
        <div class="overflow-y-auto p-3 pt-0" [style.height.px]="size().height - 44">
          <div class="space-y-2">
            <div>
              <strong class="text-green-400">Debug Mode:</strong>
              <span class="ml-1">{{ debugEnabled() ? "ON" : "OFF" }}</span>
            </div>

            <div>
              <strong class="text-blue-400">Connections:</strong>
              <div class="mt-1 ml-2 space-y-1">
                @for (conn of connections(); track conn.channelId) {
                  <div class="border-l-2 border-gray-600 pl-2">
                    <div class="font-semibold">{{ conn.channelId }}</div>
                    <div class="text-gray-400">Status: {{ conn.status }}</div>
                    @if (conn.error) {
                      <div class="text-xs text-red-400">Error: {{ conn.error.code }}</div>
                      <div class="text-xs text-gray-500">{{ conn.error.message }}</div>
                    }
                  </div>
                }
              </div>
            </div>

            <div>
              <strong class="text-yellow-400">Accounts:</strong>
              <div class="mt-1 ml-2 space-y-1">
                @for (acc of accounts(); track acc.id) {
                  <div class="border-l-2 border-gray-600 pl-2">
                    <div class="font-semibold">{{ acc.platform }} - {{ acc.username }}</div>
                    <div class="text-gray-400">Status: {{ acc.authStatus }}</div>
                  </div>
                }
              </div>
            </div>

            <div class="border-t border-gray-700 pt-2">
              <button
                class="rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                (click)="enableDebug()"
              >
                Enable Debug Logging
              </button>
              <button
                class="ml-1 rounded bg-gray-700 px-2 py-1 text-xs hover:bg-gray-600"
                (click)="clearErrors()"
              >
                Clear Errors
              </button>
            </div>
          </div>
        </div>
      }

      <div
        class="absolute right-0 bottom-0 flex h-6 w-6 cursor-se-resize items-center justify-center rounded-br-lg bg-gray-900 text-gray-500 hover:text-gray-300"
        (mousedown)="onResizeStart($event)"
        [style.display]="isOpen() ? 'flex' : 'none'"
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
export class DebugPanelComponent implements OnInit {
  private readonly connectionState = inject(ConnectionStateService);
  private readonly authService = inject(AuthorizationService);
  private readonly logger = inject(LoggerService);
  private readonly chatList = inject(ChatListService);

  readonly isOpen = signal(false);
  readonly debugEnabled = signal(false);
  readonly position = signal({ x: 0, y: 0 });
  readonly size = signal({ width: 320, height: 160 });

  private isDragging = false;
  private isResizing = false;
  private dragStart = { x: 0, y: 0 };
  private panelStart = { x: 0, y: 0 };
  private initialSize = { width: 320, height: 200 };

  readonly connections = computed(() => this.connectionState.connections());
  readonly accounts = computed(() => this.authService.accounts());

  ngOnInit(): void {
    this.debugEnabled.set(
      typeof window !== "undefined" && window.localStorage?.getItem("unichat_debug") === "true"
    );

    const savedPos = localStorage.getItem("debug-panel-pos");
    if (savedPos) {
      try {
        this.position.set(JSON.parse(savedPos));
      } catch {}
    } else {
      this.position.set({
        x: window.innerWidth - 340,
        y: window.innerHeight - 380,
      });
    }

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
  }

  toggle(event: MouseEvent): void {
    event.stopPropagation();
    this.isOpen.update((v) => !v);
    localStorage.setItem("debug-panel-open", String(this.isOpen()));
    if (this.isOpen() && this.size().height < 200) {
      this.size.set({ width: this.size().width, height: 200 });
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
    localStorage.setItem("debug-panel-pos", JSON.stringify(this.position()));
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
      width: Math.max(200, this.initialSize.width + dw),
      height: Math.max(150, this.initialSize.height + dh),
    }));
    localStorage.setItem("debug-panel-size", JSON.stringify(this.size()));
  };

  private onResizeEnd = (): void => {
    this.isResizing = false;
    document.removeEventListener("mousemove", this.onResizeMove);
    document.removeEventListener("mouseup", this.onResizeEnd);
  };

  enableDebug(): void {
    if (typeof window !== "undefined" && window.localStorage) {
      window.localStorage.setItem("unichat_debug", "true");
      this.debugEnabled.set(true);
      window.location.reload();
    }
  }

  clearErrors(): void {
    for (const conn of this.connections()) {
      const channelRef = buildChannelRef(conn.platform, conn.channelId);
      this.connectionState.clearError(channelRef);
    }
  }
}
