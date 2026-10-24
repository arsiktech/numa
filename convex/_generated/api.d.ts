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
import type * as agentAccess from "../agentAccess.js";
import type * as agentMcp from "../agentMcp.js";
import type * as aiActions from "../aiActions.js";
import type * as appleLifecycle from "../appleLifecycle.js";
import type * as appleNotifications from "../appleNotifications.js";
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
import type * as debtEvents from "../debtEvents.js";
import type * as defiEarnings from "../defiEarnings.js";
import type * as goals from "../goals.js";
import type * as holdings from "../holdings.js";
import type * as http from "../http.js";
import type * as invites from "../invites.js";
import type * as ledger from "../ledger.js";
import type * as liabilities from "../liabilities.js";
import type * as liabilitySources from "../liabilitySources.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_agentTools from "../lib/agentTools.js";
import type * as lib_aiAudit from "../lib/aiAudit.js";
import type * as lib_aiPermission from "../lib/aiPermission.js";
import type * as lib_appleAccountTarget from "../lib/appleAccountTarget.js";
import type * as lib_appleIdentity from "../lib/appleIdentity.js";
import type * as lib_appleNotifications from "../lib/appleNotifications.js";
import type * as lib_appleTokens from "../lib/appleTokens.js";
import type * as lib_askProposals from "../lib/askProposals.js";
import type * as lib_authEmailRateLimit from "../lib/authEmailRateLimit.js";
import type * as lib_authRedirect from "../lib/authRedirect.js";
import type * as lib_avatarImage from "../lib/avatarImage.js";
import type * as lib_cardDetails from "../lib/cardDetails.js";
import type * as lib_cryptoValidators from "../lib/cryptoValidators.js";
import type * as lib_defiEarnings from "../lib/defiEarnings.js";
import type * as lib_defiPositions from "../lib/defiPositions.js";
import type * as lib_diagnosticPrivacy from "../lib/diagnosticPrivacy.js";
import type * as lib_evm from "../lib/evm.js";
import type * as lib_finance from "../lib/finance.js";
import type * as lib_financeValidators from "../lib/financeValidators.js";
import type * as lib_googleSheets from "../lib/googleSheets.js";
import type * as lib_inputGuards from "../lib/inputGuards.js";
import type * as lib_invitationAuthority from "../lib/invitationAuthority.js";
import type * as lib_keccak from "../lib/keccak.js";
import type * as lib_loanLinks from "../lib/loanLinks.js";
import type * as lib_loanTerms from "../lib/loanTerms.js";
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
import type * as lib_portalSource from "../lib/portalSource.js";
import type * as lib_priceHistory from "../lib/priceHistory.js";
import type * as lib_privacyPolicy from "../lib/privacyPolicy.js";
import type * as lib_privacyRetention from "../lib/privacyRetention.js";
import type * as lib_publicWallets from "../lib/publicWallets.js";
import type * as lib_pushAlerts from "../lib/pushAlerts.js";
import type * as lib_quoteRefresh from "../lib/quoteRefresh.js";
import type * as lib_recurringRevenue from "../lib/recurringRevenue.js";
import type * as lib_removeDocument from "../lib/removeDocument.js";
import type * as lib_settlementMath from "../lib/settlementMath.js";
import type * as lib_starterCategories from "../lib/starterCategories.js";
import type * as lib_tokenFallback from "../lib/tokenFallback.js";
import type * as lib_transactionFinance from "../lib/transactionFinance.js";
import type * as lib_walletInputSafety from "../lib/walletInputSafety.js";
import type * as loanLinks from "../loanLinks.js";
import type * as marketQuotes from "../marketQuotes.js";
import type * as memberships from "../memberships.js";
import type * as merchantImages from "../merchantImages.js";
import type * as mobile from "../mobile.js";
import type * as money from "../money.js";
import type * as moneyPods from "../moneyPods.js";
import type * as portfolios from "../portfolios.js";
import type * as priceHistory from "../priceHistory.js";
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
import type * as sheetsImport from "../sheetsImport.js";
import type * as signInMethods from "../signInMethods.js";
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
  agentAccess: typeof agentAccess;
  agentMcp: typeof agentMcp;
  aiActions: typeof aiActions;
  appleLifecycle: typeof appleLifecycle;
  appleNotifications: typeof appleNotifications;
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
  debtEvents: typeof debtEvents;
  defiEarnings: typeof defiEarnings;
  goals: typeof goals;
  holdings: typeof holdings;
  http: typeof http;
  invites: typeof invites;
  ledger: typeof ledger;
  liabilities: typeof liabilities;
  liabilitySources: typeof liabilitySources;
  "lib/access": typeof lib_access;
  "lib/agentTools": typeof lib_agentTools;
  "lib/aiAudit": typeof lib_aiAudit;
  "lib/aiPermission": typeof lib_aiPermission;
  "lib/appleAccountTarget": typeof lib_appleAccountTarget;
  "lib/appleIdentity": typeof lib_appleIdentity;
  "lib/appleNotifications": typeof lib_appleNotifications;
  "lib/appleTokens": typeof lib_appleTokens;
  "lib/askProposals": typeof lib_askProposals;
  "lib/authEmailRateLimit": typeof lib_authEmailRateLimit;
  "lib/authRedirect": typeof lib_authRedirect;
  "lib/avatarImage": typeof lib_avatarImage;
  "lib/cardDetails": typeof lib_cardDetails;
  "lib/cryptoValidators": typeof lib_cryptoValidators;
  "lib/defiEarnings": typeof lib_defiEarnings;
  "lib/defiPositions": typeof lib_defiPositions;
  "lib/diagnosticPrivacy": typeof lib_diagnosticPrivacy;
  "lib/evm": typeof lib_evm;
  "lib/finance": typeof lib_finance;
  "lib/financeValidators": typeof lib_financeValidators;
  "lib/googleSheets": typeof lib_googleSheets;
  "lib/inputGuards": typeof lib_inputGuards;
  "lib/invitationAuthority": typeof lib_invitationAuthority;
  "lib/keccak": typeof lib_keccak;
  "lib/loanLinks": typeof lib_loanLinks;
  "lib/loanTerms": typeof lib_loanTerms;
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
  "lib/portalSource": typeof lib_portalSource;
  "lib/priceHistory": typeof lib_priceHistory;
  "lib/privacyPolicy": typeof lib_privacyPolicy;
  "lib/privacyRetention": typeof lib_privacyRetention;
  "lib/publicWallets": typeof lib_publicWallets;
  "lib/pushAlerts": typeof lib_pushAlerts;
  "lib/quoteRefresh": typeof lib_quoteRefresh;
  "lib/recurringRevenue": typeof lib_recurringRevenue;
  "lib/removeDocument": typeof lib_removeDocument;
  "lib/settlementMath": typeof lib_settlementMath;
  "lib/starterCategories": typeof lib_starterCategories;
  "lib/tokenFallback": typeof lib_tokenFallback;
  "lib/transactionFinance": typeof lib_transactionFinance;
  "lib/walletInputSafety": typeof lib_walletInputSafety;
  loanLinks: typeof loanLinks;
  marketQuotes: typeof marketQuotes;
  memberships: typeof memberships;
  merchantImages: typeof merchantImages;
  mobile: typeof mobile;
  money: typeof money;
  moneyPods: typeof moneyPods;
  portfolios: typeof portfolios;
  priceHistory: typeof priceHistory;
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
  sheetsImport: typeof sheetsImport;
  signInMethods: typeof signInMethods;
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
