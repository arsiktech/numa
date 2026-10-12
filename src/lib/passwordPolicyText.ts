import type { PasswordPolicyIssue, PasswordPolicyIssueCode } from "../../convex/lib/passwordPolicy";
import type { I18nKey } from "./i18n";

const PASSWORD_POLICY_MESSAGE_KEYS = {
  minLength: "passwordPolicy.minLength",
  characterMix: "passwordPolicy.characterMix",
  commonPassword: "passwordPolicy.commonPassword",
  repeatedCharacters: "passwordPolicy.repeatedCharacters",
  sequentialCharacters: "passwordPolicy.sequentialCharacters",
  personalInfo: "passwordPolicy.personalInfo"
} satisfies Record<PasswordPolicyIssueCode, I18nKey>;

export function localizePasswordPolicyIssues(
  issues: PasswordPolicyIssue[],
  t: (key: I18nKey) => string
) {
  return issues.map((issue) => t(PASSWORD_POLICY_MESSAGE_KEYS[issue.code]));
}
