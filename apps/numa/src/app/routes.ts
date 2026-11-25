/** First path segment the app itself can show. Static pages live outside this shell. */
const KNOWN = new Set(['', 'sign-in', 'auth', 'ask', 'settings', 'holdings', 'import', 'password', 'delete-account', 'earnings', 'movers', 'money-map', 'flow', 'plan', 'day', 'item', 'loan', 'person', 'position', 'tx', 'deleted']);

export function isKnownPath(path: string) {
  const segment = path.split('?')[0].split('#')[0].split('/').filter(Boolean)[0] ?? '';
  return KNOWN.has(segment);
}

const TITLES: { test: RegExp; title: string; description: string }[] = [
  { test: /^\/sign-in\/?$/, title: 'Sign in', description: 'Sign in to Numa Pro.' },
  { test: /^\/auth\/?$/, title: 'Sign in', description: 'Finishing sign in to Numa Pro.' },
  { test: /^\/ask\/?$/, title: 'Ask', description: 'Ask Numa or add a record.' },
  { test: /^\/movers\/?$/, title: 'What moved', description: 'Why your net worth changed.' },
  { test: /^\/flow\/?$/, title: 'Flow', description: 'Cash flow for the month.' },
  { test: /^\/plan\/?$/, title: 'Plan', description: 'Goals and how long cash lasts.' },
  { test: /^\/holdings(\/|$)/, title: 'Holdings', description: 'What you own and what you owe.' },
  { test: /^\/position\//, title: 'Position', description: 'Where this asset sits across your records.' },
  { test: /^\/item\//, title: 'Record', description: 'Edit or inspect one record.' },
  { test: /^\/day\//, title: 'Saved date', description: 'What your portfolio held on this date.' },
  { test: /^\/tx\//, title: 'Transaction', description: 'Edit or inspect one transaction.' },
  { test: /^\/loan\//, title: 'Loan', description: 'Collateral, deployed money and payments.' },
  { test: /^\/person\//, title: 'Debts', description: 'Every debt and payment with this party.' },
  { test: /^\/money-map\/?$/, title: 'Money map', description: 'Who you owe, who owes you and where your money sits.' },
  { test: /^\/earnings\/?$/, title: 'DeFi earnings', description: 'What your DeFi strategies earned over time.' },
  { test: /^\/import\/?$/, title: 'Import', description: 'Import transactions, balances or a wealth log.' },
  { test: /^\/password\/?$/, title: 'Password', description: 'Set or change your Numa Pro password.' },
  { test: /^\/delete-account\/?$/, title: 'Delete account', description: 'Schedule deletion of your Numa Pro account.' },
  { test: /^\/deleted\/?$/, title: 'Deleted', description: 'Records deleted from this space and their history.' },
  { test: /^\/settings\/?$/, title: 'Settings', description: 'Account, currency and alerts.' },
  { test: /^\/$/, title: 'Home', description: 'Net worth, cash flow and what needs you, on every device.' },
];

export function routeMeta(path: string) {
  return TITLES.find((row) => row.test.test(path)) ?? { title: 'Page not found', description: 'That page is not in Numa Pro.' };
}
