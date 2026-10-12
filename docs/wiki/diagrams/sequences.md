# Sequence Diagrams

## Workflow: Authenticated App Boot

The browser applies local visual state before React, then enters Convex Auth, route gates, cloud mirroring, store hooks, and the authenticated layout.

```mermaid
sequenceDiagram
    participant User
    participant Main as "src/main.tsx"
    participant Auth as "AuthProvider"
    participant Router as "src/App.tsx router"
    participant Cloud as "CloudDataProvider"
    participant Store as "StoreProvider"
    participant Convex
    participant UI as "AppLayout + route"

    User->>Main: opens app
    Main->>Main: apply theme, palette, mode, recovery
    Main->>Auth: mount
    Auth->>Convex: Convex Auth session/profile queries
    Auth-->>Router: currentAccount or cloud-loading
    Router->>Cloud: protected route mounts
    Cloud->>Convex: list portfolios and pods
    Cloud->>Convex: route-scoped detail queries
    Cloud-->>Store: cloud mirror state
    Store-->>UI: hooks return product state
    UI-->>User: mode-specific screen
```

## Workflow: Shared Pod Expense Create

The `/pod` UI uses typed pod actions and the durable queue. Convex validates role, pod currency, member/group references, split totals, and mutation receipts before the cloud mirror refreshes.

```mermaid
sequenceDiagram
    participant User
    participant Pod as "src/routes/pod/page.tsx"
    participant Actions as "usePodActions"
    participant Queue as "writeQueue"
    participant Convex as "convex/moneyPods.addExpense"
    participant Access as "access + validators"
    participant Cloud as "cloudStore"

    User->>Pod: fills shared expense sheet
    Pod->>Actions: createPodExpense(input)
    Actions->>Queue: runOrQueue(operation, clientMutationId)
    Queue->>Convex: mutation payload
    Convex->>Access: requirePodEditor, requirePodCurrency, validateExpenseInput
    Access-->>Convex: allowed
    Convex->>Convex: withMutationReceipt + insert podExpense
    Convex-->>Queue: id, replayed flag
    Queue-->>Actions: queued or confirmed result
    Actions-->>Pod: update optimistic/local state as needed
    Cloud->>Convex: bundled pod query refresh
    Cloud-->>Pod: fresh members/groups/expenses/settlements
```

## Workflow: Numa AI Draft Or Chat

`/numa` and the quick chat dialog first try local deterministic draft parsing. If no draft is found, they call `/api/chat`, which requires a signed-in Convex user and rate-limit budget before AI Gateway streaming.

```mermaid
sequenceDiagram
    participant User
    participant NumaOS as "NumaOS / AIChatDialog"
    participant Engine as "features/numa/engine.ts"
    participant Drafts as "convex/aiActions.ts"
    participant ChatAPI as "api/chat.ts"
    participant Gateway as "Vercel AI Gateway"

    User->>NumaOS: sends prompt
    NumaOS->>NumaOS: wait for settled money context
    NumaOS->>Engine: parseActionDraft(text)
    alt local draft detected
        NumaOS->>Drafts: createDraft(portfolioId, actionType, payload)
        Drafts-->>NumaOS: draft id
        NumaOS-->>User: approval card
    else normal chat
        NumaOS->>Engine: buildContext(...)
        NumaOS->>ChatAPI: POST messages + context + bearer token
        ChatAPI->>ChatAPI: validate body, user token, rate limit, daily budget
        ChatAPI->>Gateway: streamText(model, system, messages)
        Gateway-->>ChatAPI: text stream
        ChatAPI-->>NumaOS: streamed reply
    end
```

## Workflow: External Transaction Webhook

The webhook route never exposes `transactions.add` directly. It hashes the raw token, then Convex validates scope and membership before atomically inserting the transaction.

```mermaid
sequenceDiagram
    participant Caller as "External caller"
    participant Webhook as "api/webhooks/transaction.ts"
    participant Rate as "rate-limit.ts"
    participant Convex as "webhookTokens.ingestTransaction"
    participant DB as "Convex tables"

    Caller->>Webhook: POST token + transaction payload
    Webhook->>Webhook: validate method/body
    Webhook->>Webhook: SHA-256 raw token
    Webhook->>Rate: consume token-hash bucket
    Rate-->>Webhook: allowed
    Webhook->>Convex: tokenHash + internal secret + normalized transaction
    Convex->>DB: validate token, scope, issuer membership
    Convex->>DB: resolve category and insert transaction atomically
    Convex-->>Webhook: ok + transaction id
    Webhook-->>Caller: JSON result
```
