export const PASSWORD_MIN_LENGTH = 10;

const COMMON_PASSWORDS = new Set([
  "password",
  "password1",
  "password12",
  "password123",
  "qwerty",
  "qwerty123",
  "123456",
  "12345678",
  "123456789",
  "111111",
  "letmein",
  "welcome",
  "welcome1",
  "admin",
  "admin123",
  "test",
  "test1234",
  "numa",
  "numa1234"
]);

const COMMON_FRAGMENTS = [
  "password",
  "qwerty",
  "letmein",
  "welcome",
  "admin",
  "test",
  "numa"
];

const SEQUENCES = [
  "abcdefghijklmnopqrstuvwxyz",
  "qwertyuiop",
  "asdfghjkl",
  "zxcvbnm",
  "0123456789"
];

export type PasswordPolicyIssueCode =
  | "minLength"
  | "characterMix"
  | "commonPassword"
  | "repeatedCharacters"
  | "sequentialCharacters"
  | "personalInfo";

export type PasswordPolicyIssue = {
  code: PasswordPolicyIssueCode;
  message: string;
};

export type PasswordPolicyContext = {
  email?: string | null;
  displayName?: string | null;
};

export type PasswordPolicyResult = {
  ok: boolean;
  issues: PasswordPolicyIssue[];
};

export const PASSWORD_POLICY_MESSAGES: Record<PasswordPolicyIssueCode, string> = {
  minLength: `Use at least ${PASSWORD_MIN_LENGTH} characters.`,
  characterMix: "Use at least 3 of: uppercase, lowercase, number, symbol.",
  commonPassword: "Avoid common or easily guessed passwords.",
  repeatedCharacters: "Avoid long repeated characters.",
  sequentialCharacters: "Avoid obvious sequences like 123456 or qwerty.",
  personalInfo: "Do not include your email or name."
};

export function validatePasswordPolicy(
  password: string | null | undefined,
  context: PasswordPolicyContext = {}
): PasswordPolicyResult {
  const value = typeof password === "string" ? password : "";
  const issues: PasswordPolicyIssue[] = [];
  const addIssue = (code: PasswordPolicyIssueCode) => {
    if (!issues.some((issue) => issue.code === code)) {
      issues.push({ code, message: PASSWORD_POLICY_MESSAGES[code] });
    }
  };

  if (value.length < PASSWORD_MIN_LENGTH) {
    addIssue("minLength");
  }

  const classes = [
    /[a-z]/.test(value),
    /[A-Z]/.test(value),
    /\d/.test(value),
    /[^A-Za-z0-9]/.test(value)
  ].filter(Boolean).length;
  if (classes < 3) {
    addIssue("characterMix");
  }

  if (/(.)\1{4,}/u.test(value)) {
    addIssue("repeatedCharacters");
  }

  const normalized = normalizeForCommonPassword(value);
  if (
    COMMON_PASSWORDS.has(normalized) ||
    COMMON_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  ) {
    addIssue("commonPassword");
  }

  if (hasObviousSequence(normalizeForSequence(value))) {
    addIssue("sequentialCharacters");
  }

  const personalTokens = tokensFromContext(context);
  if (personalTokens.some((token) => normalized.includes(token))) {
    addIssue("personalInfo");
  }

  return {
    ok: issues.length === 0,
    issues
  };
}

export function assertPasswordPolicy(
  password: string | null | undefined,
  context: PasswordPolicyContext = {}
) {
  const result = validatePasswordPolicy(password, context);
  if (!result.ok) {
    throw new Error(result.issues[0]?.message ?? "Password is too weak.");
  }
}

function normalizeForCommonPassword(value: string) {
  return value
    .toLowerCase()
    .replace(/@/g, "a")
    .replace(/\$/g, "s")
    .replace(/0/g, "o")
    .replace(/1/g, "i")
    .replace(/!/g, "i")
    .replace(/3/g, "e")
    .replace(/5/g, "s")
    .replace(/[^a-z0-9]/g, "");
}

function normalizeForSequence(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function hasObviousSequence(normalized: string) {
  if (normalized.length < 4) return false;
  return SEQUENCES.some((sequence) => {
    for (let size = 4; size <= sequence.length; size += 1) {
      for (let start = 0; start <= sequence.length - size; start += 1) {
        const chunk = sequence.slice(start, start + size);
        if (normalized.includes(chunk) || normalized.includes(reverse(chunk))) {
          return true;
        }
      }
    }
    return false;
  });
}

function tokensFromContext(context: PasswordPolicyContext) {
  const raw = [
    context.email?.split("@")[0],
    ...(context.displayName?.split(/\s+/) ?? [])
  ];
  return raw
    .map((token) => normalizeForCommonPassword(token ?? ""))
    .filter((token) => token.length >= 3);
}

function reverse(value: string) {
  return value.split("").reverse().join("");
}
