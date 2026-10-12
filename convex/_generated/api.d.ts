/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as NumaPassword from "../NumaPassword.js";
import type * as ResendOTPPasswordReset from "../ResendOTPPasswordReset.js";
import type * as ResendOTPVerify from "../ResendOTPVerify.js";
import type * as aiActions from "../aiActions.js";
import type * as ask from "../ask.js";
import type * as assets from "../assets.js";
import type * as auth from "../auth.js";
import type * as authConfig from "../authConfig.js";
import type * as authEmailRateLimits from "../authEmailRateLimits.js";
import type * as authManagement from "../authManagement.js";
import type * as categories from "../categories.js";
import type * as clientErrors from "../clientErrors.js";
import type * as crons from "../crons.js";
import type * as cryptoWallets from "../cryptoWallets.js";
import type * as dataExport from "../dataExport.js";
import type * as goals from "../goals.js";
import type * as holdings from "../holdings.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as ledger from "../ledger.js";
import type * as liabilities from "../liabilities.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_aiAudit from "../lib/aiAudit.js";
import type * as lib_appleIdentity from "../lib/appleIdentity.js";
import type * as lib_askProposals from "../lib/askProposals.js";
import type * as lib_authEmailRateLimit from "../lib/authEmailRateLimit.js";
import type * as lib_authRedirect from "../lib/authRedirect.js";
import type * as lib_avatarImage from "../lib/avatarImage.js";
import type * as lib_cryptoValidators from "../lib/cryptoValidators.js";
import type * as lib_diagnosticPrivacy from "../lib/diagnosticPrivacy.js";
import type * as lib_finance from "../lib/finance.js";
import type * as lib_financeValidators from "../lib/financeValidators.js";
import type * as lib_inputGuards from "../lib/inputGuards.js";
import type * as lib_marketQuoteProviders from "../lib/marketQuoteProviders.js";
import type * as lib_mobileDashboard from "../lib/mobileDashboard.js";
import type * as lib_mobilePortfolio from "../lib/mobilePortfolio.js";
import type * as lib_mobileRecords from "../lib/mobileRecords.js";
import type * as lib_mobileSupport from "../lib/mobileSupport.js";
import type * as lib_moneyPodsEntries from "../lib/moneyPodsEntries.js";
import type * as lib_moneyPodsInvites from "../lib/moneyPodsInvites.js";
import type * as lib_mutationReceipts from "../lib/mutationReceipts.js";
import type * as lib_passwordPolicy from "../lib/passwordPolicy.js";
import type * as lib_podAccess from "../lib/podAccess.js";
import type * as lib_podValidation from "../lib/podValidation.js";
import type * as lib_privacyPolicy from "../lib/privacyPolicy.js";
import type * as lib_privacyRetention from "../lib/privacyRetention.js";
import type * as lib_publicWallets from "../lib/publicWallets.js";
import type * as lib_pushAlerts from "../lib/pushAlerts.js";
import type * as lib_recurringRevenue from "../lib/recurringRevenue.js";
import type * as lib_removeDocument from "../lib/removeDocument.js";
import type * as lib_settlementMath from "../lib/settlementMath.js";
import type * as lib_starterCategories from "../lib/starterCategories.js";
import type * as lib_transactionFinance from "../lib/transactionFinance.js";
import type * as lib_walletInputSafety from "../lib/walletInputSafety.js";
import type * as marketQuotes from "../marketQuotes.js";
import type * as memberships from "../memberships.js";
import type * as merchantImages from "../merchantImages.js";
import type * as mobile from "../mobile.js";
import type * as money from "../money.js";
import type * as moneyPods from "../moneyPods.js";
import type * as portfolios from "../portfolios.js";
import type * as privacy from "../privacy.js";
import type * as privacyRetention from "../privacyRetention.js";
import type * as profileAvatars from "../profileAvatars.js";
import type * as profiles from "../profiles.js";
import type * as pushAlerts from "../pushAlerts.js";
import type * as pushSubscriptions from "../pushSubscriptions.js";
import type * as rateLimits from "../rateLimits.js";
import type * as recap from "../recap.js";
import type * as recurring from "../recurring.js";
import type * as settlements from "../settlements.js";
import type * as spaces from "../spaces.js";
import type * as transactions from "../transactions.js";
import type * as users from "../users.js";
import type * as walletSync from "../walletSync.js";
import type * as wealthSnapshots from "../wealthSnapshots.js";
import type * as webhookTokens from "../webhookTokens.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  NumaPassword: typeof NumaPassword;
  ResendOTPPasswordReset: typeof ResendOTPPasswordReset;
  ResendOTPVerify: typeof ResendOTPVerify;
  aiActions: typeof aiActions;
  ask: typeof ask;
  assets: typeof assets;
  auth: typeof auth;
  authConfig: typeof authConfig;
  authEmailRateLimits: typeof authEmailRateLimits;
  authManagement: typeof authManagement;
  categories: typeof categories;
  clientErrors: typeof clientErrors;
  crons: typeof crons;
  cryptoWallets: typeof cryptoWallets;
  dataExport: typeof dataExport;
  goals: typeof goals;
  holdings: typeof holdings;
  http: typeof http;
  invites: typeof invites;
  ledger: typeof ledger;
  liabilities: typeof liabilities;
  "lib/access": typeof lib_access;
  "lib/aiAudit": typeof lib_aiAudit;
  "lib/appleIdentity": typeof lib_appleIdentity;
  "lib/askProposals": typeof lib_askProposals;
  "lib/authEmailRateLimit": typeof lib_authEmailRateLimit;
  "lib/authRedirect": typeof lib_authRedirect;
  "lib/avatarImage": typeof lib_avatarImage;
  "lib/cryptoValidators": typeof lib_cryptoValidators;
  "lib/diagnosticPrivacy": typeof lib_diagnosticPrivacy;
  "lib/finance": typeof lib_finance;
  "lib/financeValidators": typeof lib_financeValidators;
  "lib/inputGuards": typeof lib_inputGuards;
  "lib/marketQuoteProviders": typeof lib_marketQuoteProviders;
  "lib/mobileDashboard": typeof lib_mobileDashboard;
  "lib/mobilePortfolio": typeof lib_mobilePortfolio;
  "lib/mobileRecords": typeof lib_mobileRecords;
  "lib/mobileSupport": typeof lib_mobileSupport;
  "lib/moneyPodsEntries": typeof lib_moneyPodsEntries;
  "lib/moneyPodsInvites": typeof lib_moneyPodsInvites;
  "lib/mutationReceipts": typeof lib_mutationReceipts;
  "lib/passwordPolicy": typeof lib_passwordPolicy;
  "lib/podAccess": typeof lib_podAccess;
  "lib/podValidation": typeof lib_podValidation;
  "lib/privacyPolicy": typeof lib_privacyPolicy;
  "lib/privacyRetention": typeof lib_privacyRetention;
  "lib/publicWallets": typeof lib_publicWallets;
  "lib/pushAlerts": typeof lib_pushAlerts;
  "lib/recurringRevenue": typeof lib_recurringRevenue;
  "lib/removeDocument": typeof lib_removeDocument;
  "lib/settlementMath": typeof lib_settlementMath;
  "lib/starterCategories": typeof lib_starterCategories;
  "lib/transactionFinance": typeof lib_transactionFinance;
  "lib/walletInputSafety": typeof lib_walletInputSafety;
  marketQuotes: typeof marketQuotes;
  memberships: typeof memberships;
  merchantImages: typeof merchantImages;
  mobile: typeof mobile;
  money: typeof money;
  moneyPods: typeof moneyPods;
  portfolios: typeof portfolios;
  privacy: typeof privacy;
  privacyRetention: typeof privacyRetention;
  profileAvatars: typeof profileAvatars;
  profiles: typeof profiles;
  pushAlerts: typeof pushAlerts;
  pushSubscriptions: typeof pushSubscriptions;
  rateLimits: typeof rateLimits;
  recap: typeof recap;
  recurring: typeof recurring;
  settlements: typeof settlements;
  spaces: typeof spaces;
  transactions: typeof transactions;
  users: typeof users;
  walletSync: typeof walletSync;
  wealthSnapshots: typeof wealthSnapshots;
  webhookTokens: typeof webhookTokens;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
