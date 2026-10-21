import type { AgentAccess } from '@/cloud/api';

/**
 * What the user pastes into their agent: the secret link plus how each common
 * client adds it. One paste is enough for an agent that can add MCP servers
 * itself; for the others it says exactly where the link goes.
 */
export function agentPrompt(link: string, access: AgentAccess): string {
  return [
    `Connect to my Numa Pro account. It is an MCP server (Streamable HTTP) at this link:`,
    link,
    '',
    'How to add it:',
    `• Claude Code: claude mcp add --transport http numa-pro ${link}`,
    '• Claude (app or claude.ai): Settings, Connectors, Add custom connector, paste the link.',
    '• ChatGPT: Settings, Connectors, Create, paste the link, no authentication.',
    '• Cursor, Codex or any other MCP client: add a remote MCP server with this URL.',
    '',
    access === 'full'
      ? 'You can read and change my records: transactions, accounts, holdings, debts, goals, limits, wallets and history. Confirm with me before deleting anything.'
      : 'You can read my records but not change them.',
    'Start with the get_overview tool. The link is a secret: do not share or log it.',
  ].join('\n');
}

/** Plain words for what an agent did, for the activity list. */
export const toolWords: Record<string, string> = {
  get_overview: 'Read the overview',
  list_spaces: 'Listed spaces',
  get_records: 'Read records',
  list_transactions: 'Read transactions',
  get_history: 'Read history',
  add_transaction: 'Added a transaction',
  update_transaction: 'Changed a transaction',
  delete_transaction: 'Deleted a transaction',
  save_asset: 'Saved an asset',
  classify_asset: 'Classified an asset',
  delete_asset: 'Deleted an asset',
  save_liability: 'Saved a debt',
  delete_liability: 'Deleted a debt',
  save_holding: 'Saved a holding',
  delete_holding: 'Deleted a holding',
  save_goal: 'Saved a goal',
  delete_goal: 'Deleted a goal',
  save_category: 'Saved a category',
  set_spending_limit: 'Set a spending limit',
  track_wallet: 'Started tracking a wallet',
  untrack_wallet: 'Stopped tracking a wallet',
  refresh_wallet: 'Checked a wallet',
  save_history_point: 'Saved a history point',
  delete_history_point: 'Deleted a history point',
};
