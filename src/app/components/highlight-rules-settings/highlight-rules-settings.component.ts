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
import { HighlightRulesService, HighlightRule } from "@services/ui/highlight-rules.service";
import { ChatListService } from "@services/data/chat-list.service";

@Component({
  selector: "app-highlight-rules-settings",
  imports: [
    FormsModule,
    MatIconModule,
    MatButtonModule,
    MatInputModule,
    MatCheckboxModule,
  ],
  templateUrl: "./highlight-rules-settings.component.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class HighlightRulesSettingsComponent {
  private readonly highlightRulesService = inject(HighlightRulesService);
  private readonly chatListService = inject(ChatListService);

  readonly rules = this.highlightRulesService.rules;
  
  // Form state
  readonly newPattern = signal("");
  readonly newIsRegex = signal(false);
  readonly newIsGlobal = signal(true);
  readonly newColor = signal("#FFD700"); // Gold by default
  readonly newChannelIds = signal<string[]>([]);

  // Edit state
  readonly editingRuleId = signal<string | null>(null);
  readonly editingPattern = signal("");
  readonly editingIsRegex = signal(false);
  readonly editingIsGlobal = signal(true);
  readonly editingColor = signal("#FFD700");
  readonly editingChannelIds = signal<string[]>([]);

  readonly channels = computed(() => this.chatListService.getVisibleChannels());

  readonly testMessage = signal("");
  readonly testAuthor = signal("SomeUser");
  readonly testResult = signal<string | null>(null);

  // Preset colors
  readonly presetColors = [
    { name: "Gold", value: "#FFD700" },
    { name: "Red", value: "#FF6B6B" },
    { name: "Green", value: "#51CF66" },
    { name: "Blue", value: "#339AF0" },
    { name: "Purple", value: "#DA77F2" },
    { name: "Orange", value: "#FFA94D" },
    { name: "Pink", value: "#F783AC" },
    { name: "Cyan", value: "#22B8CF" },
  ];

  startEdit(rule: HighlightRule): void {
    this.editingRuleId.set(rule.id);
    this.editingPattern.set(rule.pattern);
    this.editingIsRegex.set(rule.isRegex);
    this.editingIsGlobal.set(rule.isGlobal);
    this.editingColor.set(rule.color);
    this.editingChannelIds.set(rule.channelIds ?? []);
  }

  cancelEdit(): void {
    this.editingRuleId.set(null);
  }

  saveEdit(): void {
    const ruleId = this.editingRuleId();
    if (!ruleId) return;

    this.highlightRulesService.updateRule(ruleId, {
      pattern: this.editingPattern(),
      isRegex: this.editingIsRegex(),
      isGlobal: this.editingIsGlobal(),
      color: this.editingColor(),
      channelIds: this.editingIsGlobal() ? undefined : this.editingChannelIds(),
    });
    this.cancelEdit();
  }

  addRule(): void {
    const pattern = this.newPattern().trim();
    if (!pattern) return;

    this.highlightRulesService.addRule({
      pattern,
      isRegex: this.newIsRegex(),
      isGlobal: this.newIsGlobal(),
      color: this.newColor(),
      channelIds: this.newIsGlobal() ? undefined : this.newChannelIds(),
      isActive: true,
    });

    // Reset form
    this.newPattern.set("");
    this.newIsRegex.set(false);
    this.newIsGlobal.set(true);
    this.newColor.set("#FFD700");
    this.newChannelIds.set([]);
  }

  deleteRule(ruleId: string): void {
    this.highlightRulesService.deleteRule(ruleId);
    if (this.editingRuleId() === ruleId) {
      this.cancelEdit();
    }
  }

  toggleRule(ruleId: string): void {
    this.highlightRulesService.toggleRule(ruleId);
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

  testHighlight(): void {
    const message = this.testMessage();
    const author = this.testAuthor();
    if (!message.trim()) {
      this.testResult.set(null);
      return;
    }

    const color = this.highlightRulesService.getHighlightColor(message, author, "test");
    this.testResult.set(color);
  }
}
