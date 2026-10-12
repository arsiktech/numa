import { describe, expect, it } from "vitest";
import {
  appModeForPrimaryJob,
  ONBOARDING_JOBS,
  starterTemplateForPrimaryJob
} from "./productPositioning";

describe("onboarding product positioning", () => {
  it("maps every onboarding job to a mode and a concrete first-use promise", () => {
    for (const job of ONBOARDING_JOBS) {
      expect(appModeForPrimaryJob(job.id)).toMatch(/^(light|advanced|shared)$/);
      expect(starterTemplateForPrimaryJob(job.id)).toBe(job.starterTemplate);
      expect(job.firstAction.length).toBeGreaterThan(8);
    }
  });

  it("keeps shared-money onboarding in the shared product mode", () => {
    expect(appModeForPrimaryJob("shared_money")).toBe("shared");
  });
});
