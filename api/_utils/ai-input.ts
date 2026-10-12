import { z } from "zod";
import {
  AI_MESSAGE_CONTENT_LIMIT,
  AI_CONTEXT_CHAIN_LIMIT,
  AI_CONTEXT_CODE_LIMIT,
  AI_CONTEXT_DESCRIPTION_LIMIT,
  AI_CONTEXT_ID_LIMIT,
  AI_CONTEXT_NAME_LIMIT,
  AI_CONTEXT_SHORT_LIMIT,
  AI_RECEIPT_CONTEXT_LIST_LIMIT,
  AI_RECEIPT_TEXT_LIMIT
} from "../../src/lib/aiRequestLimits";

const boundedString = (max: number) => z.string().max(max);
const finiteNumber = z.number().finite();

const ChatMessageSchema = z.strictObject({
  role: z.enum(["user", "assistant", "system"]),
  content: boundedString(AI_MESSAGE_CONTENT_LIMIT).min(1)
});

const CategorySchema = z.strictObject({
  id: boundedString(AI_CONTEXT_ID_LIMIT),
  name: boundedString(AI_CONTEXT_NAME_LIMIT),
  kind: z.enum(["income", "expense"]),
  monthlyLimit: finiteNumber.optional()
});

const TransactionSchema = z.strictObject({
  date: boundedString(32),
  description: boundedString(AI_CONTEXT_DESCRIPTION_LIMIT),
  amount: finiteNumber,
  currency: boundedString(AI_CONTEXT_CODE_LIMIT),
  kind: z.enum(["income", "expense"]),
  categoryName: boundedString(AI_CONTEXT_NAME_LIMIT).optional()
});

const AssetSchema = z.strictObject({
  name: boundedString(AI_CONTEXT_NAME_LIMIT),
  balance: finiteNumber,
  currency: boundedString(AI_CONTEXT_CODE_LIMIT),
  kind: boundedString(AI_CONTEXT_SHORT_LIMIT)
});

const LiabilitySchema = z.strictObject({
  name: boundedString(AI_CONTEXT_NAME_LIMIT),
  balance: finiteNumber,
  currency: boundedString(AI_CONTEXT_CODE_LIMIT),
  kind: boundedString(AI_CONTEXT_SHORT_LIMIT),
  interestRate: finiteNumber.optional()
});

const GoalSchema = z.strictObject({
  label: boundedString(AI_CONTEXT_NAME_LIMIT),
  target: finiteNumber,
  currency: boundedString(AI_CONTEXT_CODE_LIMIT),
  scope: boundedString(AI_CONTEXT_SHORT_LIMIT),
  deadline: boundedString(32).optional()
});

const PodSchema = z.strictObject({
  name: boundedString(AI_CONTEXT_NAME_LIMIT),
  currency: boundedString(AI_CONTEXT_CODE_LIMIT)
});

const OnChainWalletSchema = z.strictObject({
  label: boundedString(AI_CONTEXT_NAME_LIMIT),
  addressType: z.enum(["evm", "solana", "bitcoin"]),
  includedInNetWorth: z.boolean(),
  totalUsd: finiteNumber,
  tokenValueUsd: finiteNumber,
  defiValueUsd: finiteNumber,
  debtValueUsd: finiteNumber,
  chains: z.array(boundedString(AI_CONTEXT_CHAIN_LIMIT)).max(12),
  tokens: z.array(boundedString(AI_CONTEXT_CHAIN_LIMIT)).max(12),
  protocols: z.array(boundedString(AI_CONTEXT_NAME_LIMIT)).max(12),
  partial: z.boolean(),
  stale: z.boolean(),
  updatedAt: boundedString(AI_CONTEXT_SHORT_LIMIT).optional()
});

const FxSchema = z
  .record(boundedString(AI_CONTEXT_CODE_LIMIT), finiteNumber)
  .refine((value) => Object.keys(value).length <= 20, "Too many FX rates");

export const ChatBodySchema = z.strictObject({
  messages: z.array(ChatMessageSchema).min(1).max(40),
  context: z.strictObject({
    portfolio: z.strictObject({
      name: boundedString(AI_CONTEXT_NAME_LIMIT),
      defaultCurrency: z.enum(["EUR", "USD"])
    }),
    netWorth: finiteNumber,
    liquid: finiteNumber,
    invested: finiteNumber,
    liabilities: finiteNumber,
    categories: z.array(CategorySchema).max(100),
    recentTransactions: z.array(TransactionSchema).max(80),
    assets: z.array(AssetSchema).max(100),
    liabilitiesDetail: z.array(LiabilitySchema).max(100),
    onChainWallets: z.array(OnChainWalletSchema).max(8).optional(),
    goals: z.array(GoalSchema).max(20).optional(),
    pods: z.array(PodSchema).max(20).optional(),
    fx: FxSchema.optional()
  }),
  locale: boundedString(AI_CONTEXT_CODE_LIMIT).optional(),
  focus: z.strictObject({
    date: boundedString(32),
    label: boundedString(AI_CONTEXT_NAME_LIMIT).optional()
  }).optional()
});

const ReceiptCategorySchema = z.strictObject({
  id: boundedString(AI_CONTEXT_ID_LIMIT),
  name: boundedString(AI_CONTEXT_NAME_LIMIT),
  kind: z.enum(["income", "expense"])
});

const ReceiptMemberSchema = z.strictObject({
  userId: boundedString(AI_CONTEXT_ID_LIMIT),
  displayName: boundedString(AI_CONTEXT_NAME_LIMIT)
});

export const ReceiptBodySchema = z.strictObject({
  image: boundedString(6_000_000).min(100).optional(),
  text: boundedString(AI_RECEIPT_TEXT_LIMIT).trim().min(1).optional(),
  portfolioContext: z.strictObject({
    portfolioName: boundedString(AI_CONTEXT_NAME_LIMIT).optional(),
    portfolioType: z.enum(["personal", "shared", "family"]).optional(),
    defaultCurrency: z.enum(["USD", "EUR"]).optional(),
    categories: z.array(ReceiptCategorySchema).max(AI_RECEIPT_CONTEXT_LIST_LIMIT).optional(),
    members: z.array(ReceiptMemberSchema).max(AI_RECEIPT_CONTEXT_LIST_LIMIT).optional(),
    locale: boundedString(AI_CONTEXT_CODE_LIMIT).optional()
  }).optional(),
  locale: boundedString(AI_CONTEXT_CODE_LIMIT).optional()
}).superRefine((value, context) => {
  if (!value.image && !value.text) {
    context.addIssue({
      code: "custom",
      message: "Send an image or text transcript"
    });
  }
});

export type ChatBody = z.infer<typeof ChatBodySchema>;
export type ReceiptBody = z.infer<typeof ReceiptBodySchema>;
