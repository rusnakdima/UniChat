/**
 * Image to Base64 utility
 *
 * Provides functions to convert image URLs to base64 data URLs
 * for persistent caching in IndexedDB.
 */

export async function imageToBase64(imageUrl: string): Promise<string> {
  try {
    const response = await fetch(imageUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === "string") {
          resolve(reader.result);
        } else {
          reject(new Error("Failed to convert image to base64"));
        }
      };
      reader.onerror = () => reject(new Error("Failed to read image blob"));
      reader.readAsDataURL(blob);
    });
  } catch (e) {
    throw new Error(`Image to base64 conversion failed: ${e}`);
  }
}

export function isValidBase64Image(data: string): boolean {
  if (!data) return false;
  const validTypes = ["data:image/jpeg", "data:image/png", "data:image/gif", "data:image/webp"];
  return validTypes.some((type) => data.startsWith(type));
}

export function getBase64ImageSize(base64Data: string): number {
  if (!base64Data) return 0;
  const base64 = base64Data.split(",")[1];
  if (!base64) return 0;
  return Math.ceil((base64.length * 3) / 4);
}
