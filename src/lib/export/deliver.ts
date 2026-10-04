// Getting the finished file to the person: the phone's share sheet when it can take files, a download otherwise.

/** The slice of `navigator` that sharing uses, so tests can stand in for it. */
export interface ShareNavigator {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
}

/** True when the Web Share API exists and says it can share this file (phones, some desktops). Never throws. */
export function canShareFile(nav: ShareNavigator | undefined, file: File): boolean {
  if (!nav || typeof nav.canShare !== "function" || typeof nav.share !== "function") return false;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * Opens the share sheet. Resolves false if the person closed it without choosing (not an error); throws for real failures.
 * Must be called straight from a click: browsers only allow sharing in response to one.
 */
export async function shareFile(nav: ShareNavigator, file: File, title: string): Promise<boolean> {
  try {
    await nav.share?.({ files: [file], title });
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return false;
    throw error;
  }
}

/** Saves a blob under a name via a temporary link. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoking at once can cancel the download in some browsers; a minute is plenty.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
