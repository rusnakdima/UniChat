export class PlatformResolverService {
  getDisplayName(platform: string): string {
    return platform;
  }

  getBadgeClasses(platform: string): string {
    return '';
  }

  getMixedFilterBadgeClasses(platform: string): string {
    return '';
  }

  getStatusClasses(platform: string): string {
    return '';
  }

  getStatusLabel(platform: string): string {
    return '';
  }
}
