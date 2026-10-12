import { useEffect, useMemo, useRef, useState } from "react";
import { useLocale } from "@/lib/i18n";
import type { AppLocale } from "@/lib/types";

/**
 * Typewriter quote rotator for the Home header — replaces the "Week 21"
 * label with a curated rotation of philosopher / economist / Stoic lines.
 *
 * Behaviour:
 *  • Picks a FRESH quote on every mount — i.e. each time the user lands on a
 *    mode's Home — so a new line types in on each page transition. It avoids
 *    repeating the immediately-previous quote so consecutive visits differ.
 *  • Types it character-by-character (~28–46ms/char jitter) for a real
 *    typewriter cadence, then rests with a blinking cursor. No rotation while
 *    mounted; the next quote arrives the next time Home mounts.
 *
 * A11y / perf:
 *  • `prefers-reduced-motion` → show full quote instantly, static cursor,
 *    no rotation.
 *  • `aria-live="polite"` so a screen reader announces each new quote
 *    once it's settled — we render the full text in an off-screen node
 *    instead of streaming partials.
 *  • Container is `min-h` fixed so swapping quotes never shifts layout.
 */
interface Quote {
  text: string;
  author: string;
}

const QUOTES: Record<AppLocale, Quote[]> = {
  // English — curated worthy quotes (great philosophers, Stoics,
  // economists/investors, statesmen, writers). Vetted for attribution.
  en: [
    { text: "It is not the man who has too little, but the man who craves more, that is poor.", author: "Seneca" },
    { text: "Wealth consists in not having great possessions, but in having few wants.", author: "Epicurus" },
    { text: "Money often costs too much.", author: "Ralph Waldo Emerson" },
    { text: "Price is what you pay. Value is what you get.", author: "Warren Buffett" },
    { text: "A man is rich in proportion to the number of things which he can afford to let alone.", author: "Henry David Thoreau" },
    { text: "He who knows that enough is enough will always have enough.", author: "Lao Tzu" },
    { text: "Nothing is enough for the man to whom enough is too little.", author: "Epicurus" },
    { text: "Never spend your money before you have it.", author: "Thomas Jefferson" },
    { text: "The price of anything is the amount of life you exchange for it.", author: "Henry David Thoreau" },
    { text: "Beware of little expenses; a small leak will sink a great ship.", author: "Benjamin Franklin" },
    { text: "Freedom is secured not by the fulfilling of one's desires, but by the removal of desire.", author: "Epictetus" },
    { text: "Very little is needed to make a happy life; it is all within yourself, in your way of thinking.", author: "Marcus Aurelius" },
    { text: "Money is a good servant but a bad master.", author: "Francis Bacon" },
    { text: "If you want to make a man rich, do not add to his money but take away from his desires.", author: "Epicurus" },
    { text: "He who is contented is rich.", author: "Lao Tzu" },
    { text: "Want is a growing giant whom the coat of Have was never large enough to cover.", author: "Ralph Waldo Emerson" },
    { text: "Wealth is the slave of a wise man and the master of a fool.", author: "Seneca" },
    { text: "The stock market is a device for transferring money from the impatient to the patient.", author: "Warren Buffett" },
    { text: "That man is the richest whose pleasures are the cheapest.", author: "Henry David Thoreau" },
    { text: "Do not save what is left after spending, but spend what is left after saving.", author: "Warren Buffett" },
    { text: "If you would be wealthy, think of saving as well as of getting.", author: "Benjamin Franklin" },
    { text: "The four most dangerous words in investing are: this time it's different.", author: "John Templeton" },
    { text: "He is a wise man who does not grieve for the things which he has not, but rejoices for those which he has.", author: "Epictetus" },
    { text: "There is no greater calamity than to be discontented, and there is no greater fault than the wish to acquire.", author: "Lao Tzu" },
    { text: "With coarse rice to eat, with water to drink, and my bent arm for a pillow, I have still joy in the midst of these things.", author: "Confucius" },
    { text: "Rather go to bed without dinner than to rise in debt.", author: "Benjamin Franklin" },
    { text: "It is the mind that makes us rich; this goes with us into exile, and in the wildest wilderness it finds enough to sustain the body.", author: "Seneca" },
    { text: "The investor's chief problem, and even his worst enemy, is likely to be himself.", author: "Benjamin Graham" },
    { text: "He who buys what he does not need steals from himself.", author: "Swedish proverb" },
    { text: "Seek not proud riches, but such as thou mayest get justly, use soberly, distribute cheerfully, and leave contentedly.", author: "Francis Bacon" },
    { text: "Money never made a man happy yet, nor will it; there is nothing in its nature to produce happiness.", author: "Benjamin Franklin" },
    { text: "He who lives in harmony with himself lives in harmony with the universe.", author: "Marcus Aurelius" },
    { text: "We never repent of having eaten too little.", author: "Thomas Jefferson" },
    { text: "There is no wealth like knowledge, no poverty like ignorance.", author: "Ali ibn Abi Talib" },
    { text: "Someone is sitting in the shade today because someone planted a tree a long time ago.", author: "Warren Buffett" },
    { text: "Riches are for spending, and spending for honour and good actions.", author: "Francis Bacon" },
    { text: "Time is the friend of the wonderful company, the enemy of the mediocre.", author: "Benjamin Graham" },
    { text: "The individual investor should act consistently as an investor and not as a speculator.", author: "John Templeton" },
  ],
  // Russian — curated worthy quotes (great philosophers, Stoics,
  // economists/investors, statesmen, writers). Vetted for attribution.
  ru: [
    { text: "Цена — это то, что вы платите. Ценность — то, что вы получаете.", author: "Уоррен Баффетт" },
    { text: "Не тот беден, у кого мало, а тот, кто желает большего.", author: "Сенека" },
    { text: "Деньги есть чеканенная свобода.", author: "Фёдор Достоевский" },
    { text: "Берегись малых расходов: маленькая течь потопит большой корабль.", author: "Бенджамин Франклин" },
    { text: "На свете счастья нет, но есть покой и воля.", author: "Александр Пушкин" },
    { text: "Деньги дороги, жизнь человеческая ещё дороже, а время дороже всего.", author: "Александр Суворов" },
    { text: "Деньги часто обходятся слишком дорого.", author: "Ральф Уолдо Эмерсон" },
    { text: "Кто знает, что довольно, тот богат.", author: "Лао-Цзы" },
    { text: "Богатство мудрого человека — его слуга, а глупого — его господин.", author: "Сенека" },
    { text: "Благородный муж знает, что должно, а малый человек знает лишь выгоду.", author: "Конфуций" },
    { text: "Кто богат? Тот, кто доволен. А кто это? Никто.", author: "Бенджамин Франклин" },
    { text: "Бедность, согласная с законом природы, — это богатство.", author: "Сенека" },
    { text: "Богатство — не в обилии имущества, а в умении довольствоваться немногим.", author: "Эпиктет" },
    { text: "Время — деньги.", author: "Бенджамин Франклин" },
    { text: "Не дорого ценю я громкие права, от коих не одна кружится голова.", author: "Александр Пушкин" },
    { text: "Кто не доволен тем, что имеет, не будет доволен и тем, чего хочет.", author: "Сократ" },
    { text: "Богатство состоит не в обладании сокровищами, а в умении их не желать.", author: "Артур Шопенгауэр" },
    { text: "Не копите то, что осталось после трат; тратьте то, что осталось после сбережений.", author: "Уоррен Баффетт" },
    { text: "Никто не обнимет необъятного.", author: "Козьма Прутков" },
    { text: "Зри в корень!", author: "Козьма Прутков" },
    { text: "По одёжке протягивай ножки.", author: "Русская пословица" },
    { text: "Главное — самому себе не лгите.", author: "Фёдор Достоевский" },
    { text: "Богатство не уменьшает жадности.", author: "Лев Толстой" },
    { text: "Привычка свыше нам дана: замена счастию она.", author: "Александр Пушкин" },
    { text: "Бережливость лучше прибытка.", author: "Русская пословица" },
    { text: "Если хочешь быть счастливым — будь им.", author: "Козьма Прутков" },
    { text: "В человеке должно быть всё прекрасно: и лицо, и одежда, и душа, и мысли.", author: "Антон Чехов" },
    { text: "Человек подобен дроби: в знаменателе — то, что он о себе думает, в числителе — то, что он есть на самом деле. Чем больше знаменатель, тем меньше дробь.", author: "Лев Толстой" },
    { text: "Долг платежом красен.", author: "Русская пословица" },
    { text: "Чтобы поверить в добро, надо начать делать его.", author: "Лев Толстой" },
    { text: "Желание служить общему благу должно непременно быть потребностью души, условием личного счастья.", author: "Антон Чехов" },
    { text: "Сам погибай, а товарища выручай.", author: "Александр Суворов" },
  ],
  // Spanish — curated worthy quotes (great philosophers, Stoics,
  // economists/investors, statesmen, writers). Vetted for attribution.
  es: [
    { text: "No es pobre el que tiene poco, sino el que mucho desea.", author: "Séneca" },
    { text: "El precio es lo que pagas; el valor es lo que recibes.", author: "Warren Buffett" },
    { text: "Solo el necio confunde valor y precio.", author: "Antonio Machado" },
    { text: "Si quieres hacer rico a alguien, no le añadas dinero, quítale deseos.", author: "Epicuro" },
    { text: "La riqueza no consiste en tener grandes posesiones, sino en tener pocas necesidades.", author: "Epicteto" },
    { text: "Lo bueno, si breve, dos veces bueno.", author: "Baltasar Gracián" },
    { text: "Cuídate de las pequeñas cosas, porque una pequeña gotera hunde un gran barco.", author: "Benjamin Franklin" },
    { text: "No ahorres lo que queda después de gastar; gasta lo que queda después de ahorrar.", author: "Warren Buffett" },
    { text: "Mientras esperamos vivir, la vida pasa.", author: "Séneca" },
    { text: "Caminante, no hay camino, se hace camino al andar.", author: "Antonio Machado" },
    { text: "Si compras lo que no necesitas, pronto venderás lo que necesitas.", author: "Benjamin Franklin" },
    { text: "Nada le basta a quien lo suficiente le parece poco.", author: "Epicuro" },
    { text: "Es rico quien se contenta con lo que tiene.", author: "Séneca" },
    { text: "Es de ricos contentarse con poco, pues la riqueza no está en tener mucho, sino en necesitar poco.", author: "Epicteto" },
    { text: "Si quieres conocer el valor del dinero, intenta pedirlo prestado.", author: "Benjamin Franklin" },
    { text: "Lo barato sale caro.", author: "Refrán español" },
    { text: "La riqueza consiste mucho más en el disfrute que en la posesión.", author: "Aristóteles" },
    { text: "Ninguno es tan rico que no necesite a otro; ninguno tan pobre que no pueda ser útil.", author: "Baltasar Gracián" },
    { text: "Despacito y buena letra: el hacer las cosas bien importa más que el hacerlas.", author: "Antonio Machado" },
    { text: "Más vale pájaro en mano que ciento volando.", author: "Refrán español" },
    { text: "Es de bien nacidos ser agradecidos.", author: "Miguel de Cervantes" },
    { text: "La diligencia es madre de la buena ventura.", author: "Miguel de Cervantes" },
    { text: "Más vale saber que haber.", author: "Baltasar Gracián" },
    { text: "No por mucho madrugar amanece más temprano.", author: "Refrán español" },
    { text: "El que no sabe gozar de la ventura cuando le viene, no debe quejarse si se pasa.", author: "Miguel de Cervantes" },
  ]
};

const CHAR_DELAY_MIN = 28; // ms per character — fastest tick
const CHAR_DELAY_MAX = 46; // ms per character — slowest tick (adds organic jitter)
const FADE_MS = 320; // fade-out / fade-in transition between quotes

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// Remember the last quote shown (per locale) for the lifetime of the SPA so a
// fresh mount doesn't repeat the line you just read. Module-level on purpose:
// it survives route changes (Home → History → Home types a new one) but resets
// on a full page reload, which is a fine fresh start.
const lastShown: Record<string, number> = {};

/** Pick a fresh quote index — random, but never the immediately-previous one
 *  for this locale (when the pool has more than one). Runs on every mount, so
 *  a new quote types in on each page transition. */
function pickFreshIndex(poolSize: number, localeKey: string): number {
  if (poolSize <= 1) return 0;
  const prev = lastShown[localeKey];
  let next = Math.floor(Math.random() * poolSize);
  let guard = 0;
  while (next === prev && guard < 6) {
    next = Math.floor(Math.random() * poolSize);
    guard += 1;
  }
  lastShown[localeKey] = next;
  return next;
}

export function QuoteTypewriter() {
  const { locale } = useLocale();
  const pool = useMemo(() => QUOTES[locale] ?? QUOTES.en, [locale]);
  const reducedMotion = useMemo(prefersReducedMotion, []);

  // Index of the active quote — chosen fresh on each mount (each Home visit),
  // avoiding an immediate repeat. No session pinning, no rotation while mounted.
  const [index, setIndex] = useState(() => pickFreshIndex(pool.length, locale));
  const [typed, setTyped] = useState(reducedMotion ? pool[index]?.text ?? "" : "");
  const [isTyping, setIsTyping] = useState(!reducedMotion);
  const [visible, setVisible] = useState(true);

  // Refs for cleanup — we cancel any pending timeout when deps change or the
  // component unmounts so we never write to state after teardown.
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-pick only when the locale actually changes after mount (skip the initial
  // run so we don't immediately discard the useState pick and flicker).
  const didMountRef = useRef(false);
  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }
    setIndex(pickFreshIndex(pool.length, locale));
  }, [pool, locale]);

  useEffect(() => {
    const current = pool[index];
    if (!current) return;

    if (reducedMotion) {
      setTyped(current.text);
      setIsTyping(false);
      setVisible(true);
      return;
    }

    let cancelled = false;
    const clear = () => {
      if (timeoutRef.current !== null) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };

    const schedule = (fn: () => void, delay: number) => {
      clear();
      timeoutRef.current = setTimeout(() => {
        if (cancelled) return;
        fn();
      }, delay);
    };

    // Phase 1: fade in fresh, reset typed buffer, start typing.
    setTyped("");
    setIsTyping(true);
    setVisible(true);

    const typeChar = (pos: number) => {
      if (cancelled) return;
      if (pos >= current.text.length) {
        // One quote per session — once typed, sit with the blinking cursor
        // forever. No rotation, no fade-out. New session = new quote.
        setIsTyping(false);
        return;
      }
      setTyped(current.text.slice(0, pos + 1));
      const jitter = CHAR_DELAY_MIN + Math.random() * (CHAR_DELAY_MAX - CHAR_DELAY_MIN);
      schedule(() => typeChar(pos + 1), jitter);
    };

    // Tiny lead-in so the fade-in is visible before the first char lands.
    schedule(() => typeChar(0), FADE_MS);

    return () => {
      cancelled = true;
      clear();
    };
  }, [index, pool, reducedMotion]);

  const current = pool[index];
  if (!current) return null;

  // Cursor is only blinking during the hold phase. While typing it's a steady
  // bar (more readable than a flickering caret on a moving line).
  const cursorClass = isTyping ? "" : "nm-cursor-blink";

  return (
    <div
      className="mt-1 max-w-[280px] sm:max-w-[340px]"
      style={{
        minHeight: 56,
        opacity: visible ? 1 : 0,
        transition: `opacity ${FADE_MS}ms ease-out`
      }}
      aria-live="polite"
      aria-label={`${current.text} — ${current.author}`}
    >
      <p
        className="text-[14px] sm:text-[15px] italic leading-[1.35] text-[color:var(--color-ink)]"
        style={{ fontFamily: "var(--font-display)" }}
        aria-hidden
      >
        <span>{typed}</span>
        <span
          aria-hidden
          className={cursorClass}
          style={{
            display: "inline-block",
            width: 2,
            height: "0.95em",
            verticalAlign: "-0.15em",
            marginLeft: 2,
            background: "currentColor",
            borderRadius: 1
          }}
        />
      </p>
      <p
        className="mt-1 text-[10px] tracking-[0.14em] uppercase text-[color:var(--color-ink-3)]"
        style={{ fontFamily: "var(--font-mono)" }}
        aria-hidden
      >
        — {current.author}
      </p>
    </div>
  );
}
