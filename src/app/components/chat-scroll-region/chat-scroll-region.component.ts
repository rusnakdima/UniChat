/* sys lib */
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  effect,
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
import { CdkVirtualScrollViewport, ScrollingModule } from "@angular/cdk/scrolling";
import { fromEvent } from "rxjs";
import { throttleTime } from "rxjs/operators";

/* models */
import { ChatMessage } from "@models/chat.model";
@Component({
  selector: "app-chat-scroll-region",
  standalone: true,
  imports: [MatIconModule, ScrollingModule],
  templateUrl: "./chat-scroll-region.component.html",
  host: {
    class: "flex min-h-0 min-w-0 flex-1 flex-col",
  },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ChatScrollRegionComponent {
  private static readonly detachFromBottomPx = 100;
  private static readonly reattachToBottomPx = 150;
  private static readonly scrollNoiseThresholdPx = 8;
  private static readonly messageItemHeight = 80;
  private static readonly scrollBehavior: ScrollBehavior = "smooth";

  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  readonly scrollToken = input.required<string>();
  readonly messages = input.required<readonly ChatMessage[]>();

  private readonly viewport = viewChild<CdkVirtualScrollViewport>("viewport");

  private readonly pinnedToBottom = signal(true);
  readonly pendingNewCount = signal(0);
  private snapshotLength = 0;
  private prevMessageLen = 0;
  private prevNewestMessageId: string | null = null;
  private lastScrollTop = 0;
  private readonly distanceFromBottomValue = signal(0);

  readonly showJumpButton = computed(() => this.distanceFromBottomValue() > 10);
  readonly showUnreadCount = computed(() => this.distanceFromBottomValue() > 10 && this.pendingNewCount() > 0);

  // Virtual scroll configuration
  readonly virtualScrollItemSize = ChatScrollRegionComponent.messageItemHeight;

  private prevTotalHeight = 0;
  private prevOldestMessageId: string | null = null;

  private getViewportNode(): HTMLElement | null {
    const viewport = this.viewport();
    if (!viewport) {
      return null;
    }
    return viewport.elementRef.nativeElement ?? null;
  }

  constructor() {
    fromEvent(globalThis, "resize", { passive: true })
      .pipe(throttleTime(100), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.pinnedToBottom()) {
          this.scrollToBottom();
        }
      });

    afterNextRender(() => {
      const node = this.getViewportNode();
      if (!node) return;
      
      this.prevTotalHeight = node.scrollHeight;
      fromEvent(node, "scroll", { passive: true })
        .pipe(throttleTime(16), takeUntilDestroyed(this.destroyRef))
        .subscribe(() => this.onScroll());
    });

    effect(() => {
      this.scrollToken();
      untracked(() => {
        const node = this.getViewportNode();
        if (!node) return;

        this.lastScrollTop = node.scrollTop ?? 0;
        this.distanceFromBottomValue.set(0);
        this.snapshotLength = this.messages().length;
        this.prevNewestMessageId = this.getNewestMessageId();
        this.prevOldestMessageId = this.getOldestMessageId();

        if (this.pinnedToBottom()) {
          this.pendingNewCount.set(0);
          runInInjectionContext(this.injector, () => {
            afterNextRender(() => {
              queueMicrotask(() => {
                requestAnimationFrame(() => this.scrollToBottom());
              });
            });
          });
        } else {
          this.pendingNewCount.set(0);
        }

        this.prevMessageLen = this.messages().length;
      });
    });

    effect(() => {
      const messages = this.messages();
      const len = messages.length;
      const newestMessageId = this.getNewestMessageId(messages);
      const oldestMessageId = this.getOldestMessageId(messages);
      untracked(() => {
        const delta = len - this.prevMessageLen;
        const grew = len > this.prevMessageLen;
        const newestChanged = newestMessageId !== this.prevNewestMessageId;
        const oldestChanged = oldestMessageId !== this.prevOldestMessageId;
        const wasPrepend = grew && oldestChanged && !newestChanged;
        const wasAppend = grew && newestChanged;

        this.prevMessageLen = len;
        this.prevNewestMessageId = newestMessageId;
        this.prevOldestMessageId = oldestMessageId;

        if (!grew) {
          if (len < this.snapshotLength) {
            this.snapshotLength = len;
            this.pendingNewCount.set(0);
          }
          return;
        }

        if (wasPrepend) {
          this.snapshotLength = Math.max(0, this.snapshotLength + delta);
          this.preserveScrollPositionOnPrepend();
          return;
        }

        if (!newestChanged) {
          this.snapshotLength = Math.max(0, this.snapshotLength + delta);
          return;
        }

        // Check distance AFTER view updates to account for newly rendered messages
        runInInjectionContext(this.injector, () => {
          afterNextRender(() => {
            requestAnimationFrame(() => {
              const node = this.getViewportNode();
              if (!node) return;

              // If user is pinned to bottom, ALWAYS auto-scroll on new messages
              const shouldAutoScroll = this.pinnedToBottom();

              if (shouldAutoScroll) {
                this.pendingNewCount.set(0);
                this.snapshotLength = len;
                this.scrollToBottom();
                this.distanceFromBottomValue.set(0);
              } else {
                this.pendingNewCount.update((count) => count + delta);
              }
            });
          });
        });
      });
    });
  }

  onScroll(): void {
    const node = this.getViewportNode();
    if (!node) return;

    const scrollTop = node.scrollTop;
    const distance = this.distanceFromBottom(node);
    this.distanceFromBottomValue.set(distance);

    const isAtBottom = distance === 0;
    const shouldReattach = distance <= ChatScrollRegionComponent.reattachToBottomPx;

    if (!this.pinnedToBottom() && (isAtBottom || shouldReattach)) {
      this.pinnedToBottom.set(true);
      this.snapshotLength = this.messages().length;
      this.pendingNewCount.set(0);
      this.lastScrollTop = scrollTop;
      this.prevTotalHeight = node.scrollHeight;
      return;
    }

    const scrollDelta = Math.abs(scrollTop - this.lastScrollTop);
    const shouldDetach = distance > ChatScrollRegionComponent.detachFromBottomPx;

    if (scrollDelta < ChatScrollRegionComponent.scrollNoiseThresholdPx) {
      return;
    }

    this.lastScrollTop = scrollTop;
    this.prevTotalHeight = node.scrollHeight;

    if (this.pinnedToBottom() && shouldDetach) {
      this.pinnedToBottom.set(false);
      this.snapshotLength = this.messages().length;
    }
  }

  jumpToBottom(): void {
    const node = this.getViewportNode();
    if (!node) return;

    this.scrollToBottom(true);
    this.pinnedToBottom.set(true);
    this.snapshotLength = this.messages().length;
    this.pendingNewCount.set(0);
    this.distanceFromBottomValue.set(0);
    this.prevTotalHeight = node.scrollHeight;
  }

  private scrollToBottom(smooth: boolean = false): void {
    const viewportEl = this.getViewportNode();
    if (!viewportEl) return;

    if (smooth) {
      viewportEl.scrollTo({
        top: viewportEl.scrollHeight,
        behavior: ChatScrollRegionComponent.scrollBehavior,
      });
    } else {
      viewportEl.scrollTop = viewportEl.scrollHeight;
    }
    this.prevTotalHeight = viewportEl.scrollHeight;
  }

  private distanceFromBottom(node: HTMLElement): number {
    const distance = Math.max(0, node.scrollHeight - node.scrollTop - node.clientHeight);
    return distance;
  }

  private getNewestMessageId(messages: readonly ChatMessage[] = this.messages()): string | null {
    if (messages.length === 0) {
      return null;
    }
    return messages[messages.length - 1]?.id ?? null;
  }

  private getOldestMessageId(messages: readonly ChatMessage[] = this.messages()): string | null {
    if (messages.length === 0) {
      return null;
    }
    return messages[0]?.id ?? null;
  }

  private preserveScrollPositionOnPrepend(): void {
    const node = this.getViewportNode();
    if (!node) return;

    const newTotalHeight = node.scrollHeight;
    const heightDelta = newTotalHeight - this.prevTotalHeight;

    if (heightDelta > 0) {
      node.scrollTop += heightDelta;
    }

    this.prevTotalHeight = newTotalHeight;
  }
}
