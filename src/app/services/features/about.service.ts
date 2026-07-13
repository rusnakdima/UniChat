import { Injectable } from "@angular/core";
import { AboutService as LibraryAboutService } from "@tauri-front/shared";
import { GITHUB_USERNAME, GITHUB_REPO_NAME } from "@app/shared/utils/constants";

@Injectable({ providedIn: "root" })
export class AboutService extends LibraryAboutService {
  constructor() {
    super(GITHUB_REPO_NAME, GITHUB_USERNAME, GITHUB_REPO_NAME);
  }
}
