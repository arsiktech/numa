import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("Numa Pro customer-facing identity", () => {
  it("uses a whole-word accessible native brand variant without changing normal type", () => {
    const panel = read("ios/Numa/Numa/NumaWelcomeView.swift").split("private struct WelcomeHeroPanel: View {")[1].split("private struct WelcomeMoneyPreview:")[0];
    expect(panel).toContain("if dynamicTypeSize.isAccessibilitySize {");
    expect(panel).toContain('Text("Numa\\nPro")');
    expect(panel).toContain("NumaType.display(28, .bold)");
    expect(panel).toContain('.accessibilityLabel("Numa Pro")');
    expect(panel).not.toContain(".dynamicTypeSize(");
    expect(panel).toContain("NumaType.display(56, .bold)");
  });
  it("uses the full name in every localized product mention", async () => {
    for (const locale of [await import("./locales/en"), await import("./locales/es"), await import("./locales/ru")]) {
      for (const dictionary of Object.values(locale)) {
        for (const value of Object.values(dictionary)) {
          if (typeof value === "string") expect(value).not.toMatch(/\bNuma\b(?! Pro)/);
        }
      }
    }
  });

  it("keeps native customer labels consistent without renaming technical headers", () => {
    const nativeFiles = [
      "NumaAppModels.swift", "NumaAppStore.swift", "NumaAuth.swift", "NumaCaptureClient.swift",
      "NumaCaptureModels.swift", "NumaCaptureSheets.swift", "NumaCelebration.swift",
      "NumaComponents.swift", "NumaControls.swift", "NumaFormatting.swift", "NumaMainShell.swift",
      "NumaNativePages.swift", "NumaOnboardingView.swift", "NumaPalette.swift",
      "NumaQuickSheets.swift", "NumaRootView.swift", "NumaSessionStore.swift", "NumaWelcomeView.swift",
      "NumaSpaces.swift", "NumaMoney.swift", "NumaTodayView.swift",
      "ExpenseEditorSheet.swift", "MemberCardsSheet.swift"
    ];
    for (const file of nativeFiles) {
      const strings = read(`ios/Numa/Numa/${file}`).match(/"[^"\n]*"/g) ?? [];
      for (const text of strings) {
        if (text.includes("X-Numa-Convex-Deployment")) continue;
        // Intentional hard word-boundary line breaks retain the full brand.
        expect(text.replace(/\\n/g, " "), file).not.toMatch(/\b(?:Numa|NUMA)\b(?! Pro)/);
      }
    }
  });
  it("uses the full name for web installation, titles and native display", () => {
    const manifest = JSON.parse(read("public/manifest.webmanifest"));
    expect(manifest.name).toBe("Numa Pro");
    expect(manifest.short_name).toBe("Numa Pro");
    const html = read("index.html");
    expect(html).toContain("<title>Numa Pro — Track money.</title>");
    expect(html).toContain('name="apple-mobile-web-app-title" content="Numa Pro"');
    expect(html).toContain('property="og:title" content="Numa Pro — Track money."');
    expect(html).toContain('name="twitter:title" content="Numa Pro — Track money."');
    expect(read("ios/Numa/Numa/Info.plist")).toMatch(/CFBundleDisplayName<\/key>\s*<string>Numa Pro<\/string>/);
  });
});
