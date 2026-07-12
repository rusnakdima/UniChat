import { Injectable } from "@angular/core";
import { AboutService as LibraryAboutService } from "@tauri-front/shared";
import { GITHUB_USERNAME, GITHUB_REPO_NAME } from "@app/shared/utils/constants";

/**
 * UniChat's about service for checking updates and displaying app information.
 * Extends the library's AboutService to use GitHub Releases for update distribution.
 */
@Injectable({ providedIn: "root" })
export class AboutService extends LibraryAboutService {
  constructor() {
    super(GITHUB_REPO_NAME, GITHUB_USERNAME, GITHUB_REPO_NAME);
  }
}
