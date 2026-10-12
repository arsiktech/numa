import { createContext, useContext, useMemo, type ReactNode } from 'react';

import { formatMoney, formatShort } from '@/domain/money';
import type { Currency } from '@/domain/types';
import { usePrefs } from '@/state/prefs';

type MoneyValue = {
  currency: Currency;
  hidden: boolean;
  /** "€899,538" in the current currency, or "€•••,•••" while amounts are hidden. */
  money: (cents: number, opts?: { cents?: boolean; sign?: boolean }) => string;
  short: (cents: number) => string;
  /** Masks digits in any text that carries an amount. */
  mask: (text: string) => string;
};

const CurrencyContext = createContext<Currency>('EUR');

export function CurrencyScope({ currency, children }: { currency: Currency; children: ReactNode }) {
  return <CurrencyContext.Provider value={currency}>{children}</CurrencyContext.Provider>;
}

export function useMoney(): MoneyValue {
  const currency = useContext(CurrencyContext);
  const { hideAmounts: hidden } = usePrefs();
  return useMemo(() => {
    const mask = (text: string) => (hidden ? text.replace(/[0-9]/g, '•') : text);
    return {
      currency,
      hidden,
      mask,
      money: (cents, opts) => mask(formatMoney(cents, currency, opts)),
      short: (cents) => mask(formatShort(cents, currency)),
    };
  }, [currency, hidden]);
}
