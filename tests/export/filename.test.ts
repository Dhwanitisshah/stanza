import { describe, expect, it } from "vitest";
import { exportFilename, slugify } from "@/lib/export/filename";

describe("slugify", () => {
  it.each([
    ["A Patient Moon", "a-patient-moon"],
    ["  The  lamp,  burns low!  ", "the-lamp-burns-low"],
    ["Moon's Light", "moons-light"],
    ["It’s late", "its-late"],
    ["Café Naïve", "cafe-naive"],
    ["Ode to 1984", "ode-to-1984"],
    ["---weird---", "weird"],
    ["UPPER lower", "upper-lower"],
    ["", ""],
    ["!!!", ""],
    ["日本語", ""],
  ])("%j -> %j", (input, expected) => {
    expect(slugify(input)).toBe(expected);
  });

  it("keeps only safe characters: lowercase letters, digits and single dashes", () => {
    for (const input of ["a/b\\c:d*e?f\"g<h>i|j", "tab\there\nnewline", "../../etc/passwd", "con.", "emoji 🌊 wave"]) {
      expect(slugify(input)).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$|^$/);
    }
  });

  it("never gets longer than 40 characters, and does not end in half a word or a dash", () => {
    const slug = slugify("the quiet rain keeps falling slow upon the sleeping roofs of the old town");
    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith("-")).toBe(false);
    expect("the-quiet-rain-keeps-falling-slow-upon-the-sleeping-roofs".startsWith(slug)).toBe(true);
    expect(slug).toBe("the-quiet-rain-keeps-falling-slow-upon");
  });

  it("cuts one very long word at the limit", () => {
    expect(slugify("x".repeat(100))).toBe("x".repeat(40));
  });
});

describe("exportFilename", () => {
  const poem = "The lamp burns low beside the door,\nthe kettle hums a quiet tune,";

  it("uses the title when there is one", () => {
    expect(exportFilename({ title: "A Patient Moon", poem }, "mp4")).toBe("stanza-a-patient-moon.mp4");
  });

  it("falls back to the first five words of the poem when there is no title", () => {
    expect(exportFilename({ poem }, "png")).toBe("stanza-the-lamp-burns-low-beside.png");
    expect(exportFilename({ title: "", poem }, "jpg")).toBe("stanza-the-lamp-burns-low-beside.jpg");
    expect(exportFilename({ title: "   ", poem }, "webm")).toBe("stanza-the-lamp-burns-low-beside.webm");
  });

  it("falls back to the poem when the title has no usable characters", () => {
    expect(exportFilename({ title: "***", poem }, "mp4")).toBe("stanza-the-lamp-burns-low-beside.mp4");
  });

  it("is still a sensible name for a poem made of symbols", () => {
    expect(exportFilename({ poem: "... --- ..." }, "png")).toBe("stanza-poem.png");
  });

  it("uses each extension as given", () => {
    for (const ext of ["mp4", "webm", "png", "jpg"] as const) expect(exportFilename({ title: "x", poem }, ext)).toBe(`stanza-x.${ext}`);
  });

  it("handles a poem that starts with blank lines", () => {
    expect(exportFilename({ poem: "\n\n  Rain on glass,\nsoft" }, "png")).toBe("stanza-rain-on-glass-soft.png");
  });
});
