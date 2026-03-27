import { ChangeDetectionStrategy, Component, inject } from "@angular/core";
import { DomSanitizer, SafeResourceUrl } from "@angular/platform-browser";
import { openUrl } from "@tauri-apps/plugin-opener";
import { InAppLinkBrowserService } from "@services/ui/in-app-link-browser.service";
import { getLinkPreviewIframeSrc, LinkPreviewService } from "@services/ui/link-preview.service";

@Component({
  selector: "app-link-preview-modal",
  templateUrl: "./link-preview-modal.html",
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LinkPreviewModal {
  readonly linkPreview = inject(LinkPreviewService);
  private readonly inAppBrowser = inject(InAppLinkBrowserService);
  private readonly domSanitizer = inject(DomSanitizer);

  trustedFrameSrc(href: string): SafeResourceUrl {
    return this.domSanitizer.bypassSecurityTrustResourceUrl(href);
  }

  iframeSrc(href: string): string | null {
    return getLinkPreviewIframeSrc(href);
  }

  /** Original link was rewritten to YouTube `/embed/` so the iframe can load. */
  isYoutubeEmbedSubstitute(href: string): boolean {
    const src = getLinkPreviewIframeSrc(href);
    return src !== null && src !== href && src.includes("youtube.com/embed/");
  }

  close(): void {
    this.linkPreview.close();
  }

  async openInAppWindow(): Promise<void> {
    const href = this.linkPreview.state()?.href;
    if (!href) {
      return;
    }
    await this.inAppBrowser.open(href);
  }

  async openInSystemBrowser(): Promise<void> {
    const href = this.linkPreview.state()?.href;
    if (!href) {
      return;
    }
    try {
      await openUrl(href);
    } catch {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }

  openInWebTab(): void {
    const href = this.linkPreview.state()?.href;
    if (href) {
      window.open(href, "_blank", "noopener,noreferrer");
    }
  }
}
