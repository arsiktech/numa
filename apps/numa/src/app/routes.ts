/** First path segment the app itself can show. Static pages live outside this shell. */
const KNOWN = new Set(['', 'sign-in', 'auth', 'ask', 'settings', 'holdings', 'import', 'password', 'delete-account', 'earnings', 'movers', 'money-map', 'flow', 'plan', 'day', 'item', 'loan', 'person', 'position', 'tx']);

export function isKnownPath(path: string) {
  const segment = path.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] ?? '';
  return KNOWN.has(segment);
}

const TITLES: { test: RegExp; title: string; description: string }[] = [
  { test: /^\/sign-in\/?$/, title: 'Sign in', description: 'Sign in to Numa Pro.' },
  { test: /^\/ask\/?$/, title: 'Ask', description: 'Ask Numa or add a record.' },
  { test: /^\/flow\/?$/, title: 'Flow', description: 'Cash flow for the month.' },
  { test: /^\/plan\/?$/, title: 'Plan', description: 'Goals and how long cash lasts.' },
  { test: /^\/holdings/, title: 'Holdings', description: 'What you own and what you owe.' },
  { test: /^\/settings\/?$/, title: 'Settings', description: 'Account, currency and alerts.' },
  { test: /^\/$/, title: 'Home', description: 'Net worth, cash flow and what needs you, on every device.' },
];

export function routeMeta(path: string) {
  return TITLES.find((row) => row.test.test(path)) ?? { title: 'Page not found', description: 'That page is not in Numa Pro.' };
}
