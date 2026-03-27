import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
  ElementRef,
  inject,
  Injector,
  input,
  runInInjectionContext,
  signal,
  untracked,
  viewChild,
} from "@angular/core";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { MatIconModule } from "@angular/material/icon";
import { ChatMessage } from "@models/chat.model";
import { fromEvent } from "rxjs";
import { throttleTime } from "rxjs/operators";

@Component({
  selector: "app-chat-scroll-region",
  standalone: true,
  imports: [MatIconModule],
  templateUrl: "./chat-scroll-region.component.html",
  host: {
    class: "relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatScrollRegionComponent {
  private static readonly nearBottomPx = 64;
  private static readonly topThresholdPx = 200; // Consider user at "top" when within this distance

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly scrollToken = input.required<string>();
  readonly messages = input.required<readonly ChatMessage[]>();

  private readonly viewport = viewChild<ElementRef<HTMLElement>>("viewport");

  private readonly pinnedToBottom = signal(true);
  private readonly atTop = signal(false); // User is at top reading old messages
  readonly pendingNewCount = signal(0);
  private snapshotLength = 0;
  private prevMessageLen = 0;

  readonly showJumpButton = computed(() => !this.pinnedToBottom());
  readonly showUnreadCount = computed(() => !this.pinnedToBottom() && this.pendingNewCount() > 0);

  constructor() {
    fromEvent(globalThis, "resize", { passive: true })
      .pipe(throttleTime(100), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.pinnedToBottom()) {
          this.scrollToBottom();
        }
      });

    effect(() => {
      this.scrollToken();
      untracked(() => {
        this.pinnedToBottom.set(true);
        this.pendingNewCount.set(0);
        this.snapshotLength = this.messages().length;
        this.prevMessageLen = this.messages().length;
        runInInjectionContext(this.injector, () => {
          afterNextRender(() => {
            queueMicrotask(() => {
              requestAnimationFrame(() => {
                if (this.pinnedToBottom()) {
                  this.scrollToBottom();
                }
              });
            });
          });
        });
      });
    });

    effect(() => {
      const len = this.messages().length;
      untracked(() => {
        const grew = len > this.prevMessageLen;
        this.prevMessageLen = len;

        if (this.pinnedToBottom()) {
          // Only auto-scroll if we're already at bottom
          this.pendingNewCount.set(0);
          this.snapshotLength = len;
          if (grew) {
            runInInjectionContext(this.injector, () => {
              afterNextRender(() => {
                requestAnimationFrame(() => this.scrollToBottom());
              });
            });
          }
          return;
        }

        // User scrolled up - don't auto-scroll, just count pending messages
        if (grew) {
          this.pendingNewCount.set(Math.max(0, len - this.snapshotLength));
        }
      });
    });
  }

  onScroll(): void {
    const node = this.viewport()?.nativeElement;
    if (!node) {
      return;
    }
    const distance = node.scrollHeight - node.scrollTop - node.clientHeight;
    const nearBottom = distance <= ChatScrollRegionComponent.nearBottomPx;
    const atTop = node.scrollTop < ChatScrollRegionComponent.topThresholdPx;
    const msgs = this.messages();

    if (nearBottom && !this.pinnedToBottom()) {
      this.pinnedToBottom.set(true);
      this.snapshotLength = msgs.length;
      this.pendingNewCount.set(0);
      this.atTop.set(false);
    } else if (!nearBottom && this.pinnedToBottom()) {
      this.pinnedToBottom.set(false);
      this.snapshotLength = msgs.length;
      this.atTop.set(atTop);
    } else if (!nearBottom) {
      // Update atTop state while scrolled up
      this.atTop.set(atTop);
    }
  }

  jumpToBottom(): void {
    this.scrollToBottom();
    this.pinnedToBottom.set(true);
    this.snapshotLength = this.messages().length;
    this.pendingNewCount.set(0);
  }

  private scrollToBottom(): void {
    const node = this.viewport()?.nativeElement;
    if (node) {
      node.scrollTop = node.scrollHeight;
    }
  }
}
