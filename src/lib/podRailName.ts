export function splitPodRailName(name: string): { context: string | null; label: string } {
  const trimmed = name.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (trimmed.length < 28 || words.length < 4) {
    return { context: null, label: trimmed || "Shared pot" };
  }

  return {
    context: words.slice(0, -2).join(" "),
    label: words.slice(-2).join(" ")
  };
}
