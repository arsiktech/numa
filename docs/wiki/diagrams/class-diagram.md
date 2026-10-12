# Class Diagram

Numa is TypeScript-heavy, so this diagram models the central domain interfaces from [`src/lib/types.ts`](../../../src/lib/types.ts) and the main persistence/audit concepts in [`convex/schema.ts`](../../../convex/schema.ts).

```mermaid
classDiagram
    class User {
        +id string
        +displayName string
        +defaultCurrency CurrencyCode
        +appMode AppMode
    }
    class Portfolio {
        +id string
        +name string
        +type PortfolioType
        +defaultCurrency CurrencyCode
    }
    class Membership {
        +portfolioId string
        +userId string
        +ownershipBps number
        +role Role
    }
    class Transaction {
        +portfolioId string
        +kind TxKind
        +amount number
        +currency CurrencyCode
        +splits Split[]
    }
    class Category {
        +portfolioId string
        +kind CategoryKind
        +monthlyLimit number
    }
    class Asset {
        +portfolioId string
        +kind AssetKind
        +balance number
    }
    class Liability {
        +portfolioId string
        +kind LiabilityKind
        +balance number
    }
    class Holding {
        +portfolioId string
        +symbol string
        +quantity number
    }
    class MoneyPod {
        +id string
        +name string
        +currency CurrencyCode
        +ownerUserId string
    }
    class PodMember {
        +podId string
        +displayName string
        +role PodRole
        +cards string[]
        +active boolean
    }
    class PodGroup {
        +podId string
        +name string
        +color string
    }
    class PodExpense {
        +podId string
        +paidByMemberId string
        +splitMode PodSplitMode
        +customSplits CustomSplit[]
    }
    class PodSettlement {
        +podId string
        +fromMemberId string
        +toMemberId string
        +amount number
    }
    class AiActionDraft {
        +userId Id
        +actionType string
        +status DraftStatus
        +proposedPayload any
    }
    class MutationReceipt {
        +clientMutationId string
        +operation string
        +userId Id
        +resultId string
    }

    User "1" --> "many" Membership : owns joins
    Portfolio "1" --> "many" Membership : has
    Portfolio "1" --> "many" Transaction : records
    Portfolio "1" --> "many" Category : classifies
    Portfolio "1" --> "many" Asset : tracks
    Portfolio "1" --> "many" Liability : tracks
    Portfolio "1" --> "many" Holding : tracks
    MoneyPod "1" --> "many" PodMember : has
    MoneyPod "1" --> "many" PodGroup : groups
    MoneyPod "1" --> "many" PodExpense : records
    MoneyPod "1" --> "many" PodSettlement : settles
    PodMember "1" --> "many" PodExpense : paid by
    PodMember "1" --> "many" PodSettlement : from/to
    User "1" --> "many" AiActionDraft : drafts
    User "1" --> "many" MutationReceipt : replays
```

## Notes

- `CurrencyCode` is wider on the client, but Convex currently narrows mutable currency fields to `USD | EUR`.
- `10000` basis points means 100 percent for ownership and custom splits.
- Pod member removal is tombstoned, not hard-deleted, so historical settlement math remains correct.
