import { describe, expect, it, vi } from "vitest";
import { canShareFile, shareFile, type ShareNavigator } from "@/lib/export/deliver";
import { supportLink } from "@/lib/export/supportLink";

const file = new File(["x"], "stanza-test.mp4", { type: "video/mp4" });

describe("canShareFile (the Web Share API, files)", () => {
  it("is false when there is no navigator or no share support (most desktops: download instead)", () => {
    expect(canShareFile(undefined, file)).toBe(false);
    expect(canShareFile({}, file)).toBe(false);
    expect(canShareFile({ canShare: () => true }, file)).toBe(false); // can share, but there is no share()
    expect(canShareFile({ share: async () => undefined }, file)).toBe(false); // share(), but no way to ask about files
  });

  it("asks the browser about THIS file, and believes the answer", () => {
    const canShare = vi.fn(() => true);
    expect(canShareFile({ canShare, share: async () => undefined }, file)).toBe(true);
    expect(canShare).toHaveBeenCalledWith({ files: [file] });
    expect(canShareFile({ canShare: () => false, share: async () => undefined }, file)).toBe(false);
  });

  it("is false (not a crash) when canShare throws", () => {
    expect(
      canShareFile(
        {
          canShare: () => {
            throw new TypeError("bad data");
          },
          share: async () => undefined,
        },
        file,
      ),
    ).toBe(false);
  });
});

describe("shareFile", () => {
  it("shares the file with a title and says it went through", async () => {
    const share = vi.fn(async () => undefined);
    await expect(shareFile({ share }, file, "A Patient Moon")).resolves.toBe(true);
    expect(share).toHaveBeenCalledWith({ files: [file], title: "A Patient Moon" });
  });

  it("closing the share sheet is not an error: it answers false", async () => {
    const nav: ShareNavigator = {
      share: async () => {
        throw new DOMException("Share canceled", "AbortError");
      },
    };
    await expect(shareFile(nav, file, "x")).resolves.toBe(false);
  });

  it("a real failure is thrown so the dialog can show it", async () => {
    const nav: ShareNavigator = {
      share: async () => {
        throw new DOMException("not allowed", "NotAllowedError");
      },
    };
    await expect(shareFile(nav, file, "x")).rejects.toThrow("not allowed");
  });
});

describe("supportLink: hidden unless it is a real web address", () => {
  it("is null when unset, empty or blank", () => {
    for (const raw of [undefined, null, "", "   "]) expect(supportLink(raw)).toBeNull();
  });

  it("accepts https and http links", () => {
    expect(supportLink("https://buymeacoffee.com/dhwanit")).toBe("https://buymeacoffee.com/dhwanit");
    expect(supportLink("  https://ko-fi.com/x  ")).toBe("https://ko-fi.com/x");
    expect(supportLink("http://example.com")).toBe("http://example.com/");
  });

  it("refuses anything that is not a web address (a typo must not become a broken or dangerous link)", () => {
    for (const raw of ["javascript:alert(1)", "data:text/html,hi", "mailto:a@b.c", "buymeacoffee.com/x", "not a url", "ftp://x.y"]) expect(supportLink(raw), raw).toBeNull();
  });
});
