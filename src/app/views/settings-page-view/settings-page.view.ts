/* sys lib */
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  computed,
  effect,
  inject,
  signal,
} from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatIconModule } from "@angular/material/icon";

/* models */
import { ChatAccount, PlatformType } from "@models/chat.model";

/* services */
import { LocalStorageService } from "@services/core/local-storage.service";
import { AuthorizationService } from "@services/features/authorization.service";
import { ThemeService } from "@services/core/theme.service";

/* helpers */
import { YOUTUBE_DATA_API_KEY_STORAGE_KEY } from "@shared/utils/chat.helper";

/* components */
import { BlockedWordsSettingsComponent } from "@components/blocked-words-settings/blocked-words-settings.component";
import { HighlightRulesSettingsComponent } from "@components/highlight-rules-settings/highlight-rules-settings.component";
import { SettingsSectionComponent } from "@components/ui/settings-section/settings-section.component";
@Component({
  selector: "app-settings-page-view",
  standalone: true,
  imports: [
    FormsModule,
    MatIconModule,
    BlockedWordsSettingsComponent,
    HighlightRulesSettingsComponent,
    SettingsSectionComponent,
  ],
  templateUrl: "./settings-page.view.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class SettingsPageView {
  readonly authorizationService = inject(AuthorizationService);
  private readonly changeDetectorRef = inject(ChangeDetectorRef);
  private readonly localStorageService = inject(LocalStorageService);
  private readonly themeService = inject(ThemeService);
  readonly themeMode = this.themeService.themeMode;

  youtubeApiKey = "";
  showYoutubeApiKey = false;
  debugPanelEnabled = signal(
    typeof window !== "undefined" && window.localStorage?.getItem("unichat_debug") === "true"
  );

  /** Section collapse state management */
  readonly sectionStates = signal<Record<string, boolean>>({
    blockedWords: true,
    highlightRules: true,
  });

  /** Collapse all sections */
  collapseAll(): void {
    this.sectionStates.set({
      blockedWords: true,
      highlightRules: true,
    });
    this.changeDetectorRef.markForCheck();
  }

  /** Expand all sections */
  expandAll(): void {
    this.sectionStates.set({
      blockedWords: false,
      highlightRules: false,
    });
    this.changeDetectorRef.markForCheck();
  }

  /** Toggle a specific section */
  toggleSection(sectionId: string): void {
    this.sectionStates.update((states) => ({
      ...states,
      [sectionId]: !states[sectionId],
    }));
    this.changeDetectorRef.markForCheck();
  }

  /** Check if all sections are collapsed */
  allCollapsed = computed(() => {
    const states = this.sectionStates();
    return Object.values(states).every((v) => v);
  });

  /** Update section state - helper for template */
  updateSectionState(sectionId: string, collapsed: boolean): void {
    this.sectionStates.update((states) => ({
      ...states,
      [sectionId]: collapsed,
    }));
    this.changeDetectorRef.markForCheck();
  }

  constructor() {
    effect(() => {
      this.youtubeApiKey = this.localStorageService.get(YOUTUBE_DATA_API_KEY_STORAGE_KEY, "");
      this.changeDetectorRef.markForCheck();
    });
  }

  saveYoutubeApiKey(): void {
    const trimmed = this.youtubeApiKey.trim();
    if (trimmed) {
      this.localStorageService.set(YOUTUBE_DATA_API_KEY_STORAGE_KEY, trimmed);
    } else {
      this.localStorageService.remove(YOUTUBE_DATA_API_KEY_STORAGE_KEY);
    }
  }

  authorize(platform: PlatformType): void {
    void this.authorizationService.authorize(platform);
  }

  deauthorize(platform: PlatformType): void {
    void this.authorizationService.deauthorize(platform);
  }

  deauthorizeAccount(platform: PlatformType): void {
    const account = this.authorizationService.accounts().find((a) => a.platform === platform);
    if (!account) {
      return;
    }
    void this.authorizationService.deauthorizeAccount(account.id, account.platform);
  }

  removeAuthorizedAccount(account: ChatAccount): void {
    void this.authorizationService.deauthorizeAccount(account.id, account.platform);
  }

  toggleDebugPanel(): void {
    this.debugPanelEnabled.update((v) => !v);
    if (typeof window !== "undefined" && window.localStorage) {
      if (this.debugPanelEnabled()) {
        window.localStorage.setItem("unichat_debug", "true");
      } else {
        window.localStorage.removeItem("unichat_debug");
      }
    }
  }

  toggleTheme(): void {
    this.themeService.toggleTheme();
  }
}
