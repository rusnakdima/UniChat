import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
  computed,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";
import { MatButtonModule } from "@angular/material/button";
import { MatInputModule } from "@angular/material/input";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { BlockedWordsService, BlockedWordRule } from "@services/ui/blocked-words.service";
import { ChatListService } from "@services/data/chat-list.service";

@Component({
  selector: "app-blocked-words-settings",
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule,
  ],
  templateUrl: "./blocked-words-settings.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class BlockedWordsSettingsComponent {
  private readonly blockedWordsService = inject(BlockedWordsService);
  private readonly chatListService = inject(ChatListService);

  readonly rules = this.blockedWordsService.rules;
  
  // Form state
  readonly newPattern = signal("");
  readonly newIsRegex = signal(false);
  readonly newIsGlobal = signal(true);
  readonly newReplacement = signal("***");
  readonly newChannelIds = signal<string[]>([]);

  // Edit state
  readonly editingRuleId = signal<string | null>(null);
  readonly editingPattern = signal("");
  readonly editingIsRegex = signal(false);
  readonly editingIsGlobal = signal(true);
  readonly editingReplacement = signal("***");
  readonly editingChannelIds = signal<string[]>([]);

  readonly channels = computed(() => this.chatListService.getVisibleChannels());

  readonly testMessage = signal("");
  readonly testResult = signal<{ filtered: string; wasFiltered: boolean } | null>(null);

  startEdit(rule: BlockedWordRule): void {
    this.editingRuleId.set(rule.id);
    this.editingPattern.set(rule.pattern);
    this.editingIsRegex.set(rule.isRegex);
    this.editingIsGlobal.set(rule.isGlobal);
    this.editingReplacement.set(rule.replacement);
    this.editingChannelIds.set(rule.channelIds ?? []);
  }

  cancelEdit(): void {
    this.editingRuleId.set(null);
  }

  saveEdit(): void {
    const ruleId = this.editingRuleId();
    if (!ruleId) return;

    this.blockedWordsService.updateRule(ruleId, {
      pattern: this.editingPattern(),
      isRegex: this.editingIsRegex(),
      isGlobal: this.editingIsGlobal(),
      replacement: this.editingReplacement(),
      channelIds: this.editingIsGlobal() ? undefined : this.editingChannelIds(),
    });
    this.cancelEdit();
  }

  addRule(): void {
    const pattern = this.newPattern().trim();
    if (!pattern) return;

    this.blockedWordsService.addRule({
      pattern,
      isRegex: this.newIsRegex(),
      isGlobal: this.newIsGlobal(),
      replacement: this.newReplacement(),
      channelIds: this.newIsGlobal() ? undefined : this.newChannelIds(),
      isActive: true,
    });

    // Reset form
    this.newPattern.set("");
    this.newIsRegex.set(false);
    this.newIsGlobal.set(true);
    this.newReplacement.set("***");
    this.newChannelIds.set([]);
  }

  deleteRule(ruleId: string): void {
    this.blockedWordsService.deleteRule(ruleId);
    if (this.editingRuleId() === ruleId) {
      this.cancelEdit();
    }
  }

  toggleRule(ruleId: string): void {
    this.blockedWordsService.toggleRule(ruleId);
  }

  toggleChannelSelection(channelId: string): void {
    if (this.editingRuleId()) {
      // Editing mode
      const current = this.editingChannelIds();
      if (current.includes(channelId)) {
        this.editingChannelIds.set(current.filter(id => id !== channelId));
      } else {
        this.editingChannelIds.set([...current, channelId]);
      }
    } else {
      // Add mode
      const current = this.newChannelIds();
      if (current.includes(channelId)) {
        this.newChannelIds.set(current.filter(id => id !== channelId));
      } else {
        this.newChannelIds.set([...current, channelId]);
      }
    }
  }

  testFilter(): void {
    const message = this.testMessage();
    if (!message.trim()) {
      this.testResult.set(null);
      return;
    }

    // Test against all channels (global rules)
    const result = this.blockedWordsService.filterMessage(message, "test");
    this.testResult.set(result);
  }
}
