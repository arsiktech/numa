import { describe, expect, it } from "vitest";
import { parseCsv, serializeCsv } from "./csv";
import {
  analyzeTransactionsCsv,
  buildGenericPreset,
  defaultGenericMapping,
  detectPreset,
  isNumaTransactionsHeader,
  looksCommaDecimal,
  mappingFitsHeader,
  normalizeWithPreset,
  type GenericMapping
} from "./csvPresets";

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/*                                                                     */
/* Bank layouts drift over time; each fixture notes the layout year it */
/* models so a future mismatch can be traced to a format change rather */
/* than a regression.                                                  */
/* ------------------------------------------------------------------ */

/** Revolut personal-account export as shipped 2023–2025 (datetime dates, Fee column, State filter). */
const REVOLUT_CSV = [
  "Type,Product,Started Date,Completed Date,Description,Amount,Fee,Currency,State,Balance",
  "CARD_PAYMENT,Current,2024-05-01 09:12:33,2024-05-01 12:34:56,Tesco,-12.50,0.00,EUR,COMPLETED,187.50",
  "TOPUP,Current,2024-05-02 08:00:00,2024-05-02 08:00:01,Top-Up via Bank,200.00,0.00,EUR,COMPLETED,387.50",
  "CARD_PAYMENT,Current,2024-05-03 10:00:00,,Refunded purchase,-5.00,0.00,EUR,REVERTED,387.50",
  "CARD_PAYMENT,Current,2024-05-04 10:00:00,,Pending coffee,-3.20,0.00,EUR,PENDING,387.50",
  "CARD_PAYMENT,Current,2024-05-05 10:00:00,2024-05-05 11:00:00,London cab,-30.00,0.00,GBP,COMPLETED,387.50"
].join("\n");

/** N26 export, 2023+ layout (Booking Date / Partner Name / Amount (EUR)). */
const N26_NEW_CSV = [
  "Booking Date,Value Date,Partner Name,Partner Iban,Type,Payment Reference,Account Name,Amount (EUR),Original Amount,Original Currency,Exchange Rate",
  "2024-03-10,2024-03-10,REWE,DE11222233334444555566,MasterCard Payment,Groceries,Main Account,-45.67,,,",
  "2024-03-11,2024-03-11,Employer GmbH,DE99888877776666555544,Credit Transfer,Salary March,Main Account,2500.00,,,"
].join("\n");

/** N26 export, pre-2023 legacy layout (Date / Payee / Amount (EUR)). */
const N26_LEGACY_CSV = [
  "Date,Payee,Account number,Transaction type,Payment reference,Amount (EUR),Amount (Foreign Currency),Type Foreign Currency,Exchange Rate",
  "2021-07-01,Amazon,,MasterCard Payment,Order 123-456,-19.99,,,",
  "2021-07-02,Flatmate,,Income,Rent share,400.00,,,"
].join("\n");

/** Hypothetical German bank export: ";" delimiter, dd.mm.yyyy dates, decimal comma. */
const GERMAN_BANK_CSV = [
  "Buchungstag;Empfaenger;Verwendungszweck;Betrag",
  "01.02.2024;Baeckerei Schmidt;Brot;-3,50",
  "15.02.2024;Arbeitgeber;Gehalt Februar;1.234,56"
].join("\n");

describe("detectPreset", () => {
  it("detects the Revolut personal export by header subset (case-insensitive)", () => {
    const header = parseCsv(REVOLUT_CSV)[0];
    expect(detectPreset(header)?.id).toBe("revolut");
    expect(detectPreset(header.map((c) => c.toUpperCase()))?.id).toBe("revolut");
  });

  it("detects both N26 layouts under the single id n26", () => {
    expect(detectPreset(parseCsv(N26_NEW_CSV)[0])?.id).toBe("n26");
    expect(detectPreset(parseCsv(N26_LEGACY_CSV)[0])?.id).toBe("n26");
  });

  it("tolerates extra columns (subset match) but rejects unrelated headers", () => {
    const extended = [...parseCsv(REVOLUT_CSV)[0], "Some New Column"];
    expect(detectPreset(extended)?.id).toBe("revolut");
    expect(detectPreset(["foo", "bar", "baz"])).toBeNull();
    expect(detectPreset(parseCsv(GERMAN_BANK_CSV, ";")[0])).toBeNull();
  });
});

describe("normalizeWithPreset — Revolut", () => {
  const matrix = parseCsv(REVOLUT_CSV);
  const preset = detectPreset(matrix[0])!;
  const result = normalizeWithPreset(matrix, preset);

  it("skips non-COMPLETED rows and reports them in skipped", () => {
    expect(result.skipped).toBe(2); // REVERTED + PENDING
    expect(result.rows).toHaveLength(2);
  });

  it("flags the unsupported GBP row as a per-row error with its line number", () => {
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Line 6");
    expect(result.errors[0]).toContain("GBP");
  });

  it("truncates datetimes to dates and derives kind from the amount sign", () => {
    expect(result.rows[0]).toEqual({
      occurredAt: Date.UTC(2024, 4, 1),
      description: "Tesco",
      kind: "expense",
      amount: 12.5,
      currency: "EUR"
    });
    expect(result.rows[1]).toMatchObject({
      occurredAt: Date.UTC(2024, 4, 2),
      kind: "income",
      amount: 200
    });
  });
});

describe("normalizeWithPreset — N26", () => {
  it("normalizes the 2023+ layout, joining partner name and reference with a dot separator", () => {
    const matrix = parseCsv(N26_NEW_CSV);
    const result = normalizeWithPreset(matrix, detectPreset(matrix[0])!);
    expect(result.errors).toEqual([]);
    expect(result.skipped).toBe(0);
    expect(result.rows).toEqual([
      {
        occurredAt: Date.UTC(2024, 2, 10),
        description: "REWE · Groceries",
        kind: "expense",
        amount: 45.67,
        currency: "EUR"
      },
      {
        occurredAt: Date.UTC(2024, 2, 11),
        description: "Employer GmbH · Salary March",
        kind: "income",
        amount: 2500,
        currency: "EUR"
      }
    ]);
  });

  it("normalizes the legacy layout and defaults currency to EUR", () => {
    const matrix = parseCsv(N26_LEGACY_CSV);
    const result = normalizeWithPreset(matrix, detectPreset(matrix[0])!);
    expect(result.errors).toEqual([]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      description: "Amazon · Order 123-456",
      kind: "expense",
      amount: 19.99,
      currency: "EUR"
    });
    expect(result.rows[1]).toMatchObject({ kind: "income", amount: 400 });
  });
});

describe("generic mapper", () => {
  const mapping: GenericMapping = {
    dateColumn: "Buchungstag",
    dateFormat: "dd.mm.yyyy",
    amountColumn: "Betrag",
    decimalSeparator: ",",
    signConvention: "signed",
    descriptionColumns: ["Empfaenger", "Verwendungszweck"]
  };

  it("parses a ';'-delimited file via parseCsv's delimiter parameter", () => {
    const matrix = parseCsv(GERMAN_BANK_CSV, ";");
    expect(matrix[0]).toHaveLength(4);
    expect(matrix).toHaveLength(3);
  });

  it("normalizes dd.mm.yyyy dates and decimal-comma amounts (incl. thousands dot)", () => {
    const matrix = parseCsv(GERMAN_BANK_CSV, ";");
    const result = normalizeWithPreset(matrix, buildGenericPreset(mapping));
    expect(result.errors).toEqual([]);
    expect(result.rows).toEqual([
      {
        occurredAt: Date.UTC(2024, 1, 1),
        description: "Baeckerei Schmidt · Brot",
        kind: "expense",
        amount: 3.5,
        currency: "EUR"
      },
      {
        occurredAt: Date.UTC(2024, 1, 15),
        description: "Arbeitgeber · Gehalt Februar",
        kind: "income",
        amount: 1234.56,
        currency: "EUR"
      }
    ]);
  });

  it("treats every row as an expense under the allExpense sign convention", () => {
    const matrix = parseCsv(GERMAN_BANK_CSV, ";");
    const result = normalizeWithPreset(
      matrix,
      buildGenericPreset({ ...mapping, signConvention: "allExpense" })
    );
    expect(result.rows.map((r) => r.kind)).toEqual(["expense", "expense"]);
    expect(result.rows[1].amount).toBe(1234.56);
  });

  it("reports unparseable rows as line-numbered errors instead of throwing", () => {
    const broken = `${GERMAN_BANK_CSV}\nnot-a-date;X;Y;abc`;
    const matrix = parseCsv(broken, ";");
    const result = normalizeWithPreset(matrix, buildGenericPreset(mapping));
    expect(result.rows).toHaveLength(2);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("Line 4");
  });

  it("suggests sensible defaults and validates mappings against the header", () => {
    const header = parseCsv(GERMAN_BANK_CSV, ";")[0];
    const suggested = defaultGenericMapping(header);
    expect(header).toContain(suggested.dateColumn);
    expect(header).toContain(suggested.amountColumn);
    expect(mappingFitsHeader(mapping, header)).toBe(true);
    expect(mappingFitsHeader({ ...mapping, amountColumn: "Missing" }, header)).toBe(false);
  });
});

describe("serializeCsv — formula injection guard", () => {
  it("prefixes text cells starting with =, +, @, or tab with an apostrophe", () => {
    expect(serializeCsv([["=SUM(A1:A9)"]])).toBe("'=SUM(A1:A9)");
    expect(serializeCsv([["+441234 call me"]])).toBe("'+441234 call me");
    expect(serializeCsv([["@here pay up"]])).toBe("'@here pay up");
    expect(serializeCsv([["\tleading tab"]])).toBe("'\tleading tab");
    expect(serializeCsv([["-=chained()"]])).toBe("'-=chained()");
  });

  it("quotes guarded cells that also contain commas, quotes, or CR", () => {
    expect(serializeCsv([['=HYPERLINK("http://x","y")']])).toBe(
      '"\'=HYPERLINK(""http://x"",""y"")"'
    );
    expect(serializeCsv([["\rstart"]])).toBe('"\'\rstart"');
  });

  it("leaves app-formatted numeric cells untouched (negative balances, exponents)", () => {
    expect(serializeCsv([["-12.5", "1234", "-0.07", "-3e-7"]])).toBe("-12.5,1234,-0.07,-3e-7");
  });

  it("leaves ordinary text and dates alone", () => {
    expect(serializeCsv([["2024-01-31", "Groceries", "EUR"]])).toBe("2024-01-31,Groceries,EUR");
  });

  it("round-trips: the guard survives parseCsv as literal text", () => {
    expect(parseCsv(serializeCsv([["=cmd|'/c calc'!A0", "ok"]]))).toEqual([
      ["'=cmd|'/c calc'!A0", "ok"]
    ]);
  });
});

describe("comma-decimal auto-detection", () => {
  /** Amounts written with a decimal comma but imported with "." selected. */
  const MISCONFIGURED_CSV = [
    "Date,Description,Amount",
    '2024-01-05,Coffee,"-12,50"',
    '2024-01-06,Salary,"1.234,56"',
    '2024-01-07,Snack,"-3,9"'
  ].join("\n");
  const dotMapping: GenericMapping = {
    dateColumn: "Date",
    dateFormat: "iso",
    amountColumn: "Amount",
    decimalSeparator: ".",
    signConvention: "signed",
    descriptionColumns: ["Description"]
  };

  it("looksCommaDecimal matches grouped and simple comma decimals only", () => {
    expect(looksCommaDecimal("12,50")).toBe(true);
    expect(looksCommaDecimal("-1.234,56")).toBe(true);
    expect(looksCommaDecimal("3,9")).toBe(true);
    expect(looksCommaDecimal("1,234.56")).toBe(false);
    expect(looksCommaDecimal("1,234")).toBe(false); // 3 digits after comma → thousands
    expect(looksCommaDecimal("12.50")).toBe(false);
    expect(looksCommaDecimal("")).toBe(false);
  });

  it('parses "12,50" as 12.5 even when "." is the selected separator', () => {
    const matrix = parseCsv(MISCONFIGURED_CSV);
    const result = normalizeWithPreset(matrix, buildGenericPreset(dotMapping));
    expect(result.errors).toEqual([]);
    expect(result.rows.map((r) => r.amount)).toEqual([12.5, 1234.56, 3.9]);
    expect(result.rows.map((r) => r.kind)).toEqual(["expense", "income", "expense"]);
  });

  it('warns when >20% of amount cells look comma-decimal under "."', () => {
    const matrix = parseCsv(MISCONFIGURED_CSV);
    const result = normalizeWithPreset(matrix, buildGenericPreset(dotMapping));
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("comma decimals");
  });

  it("does not warn when the comma separator is selected", () => {
    const matrix = parseCsv(MISCONFIGURED_CSV);
    const result = normalizeWithPreset(
      matrix,
      buildGenericPreset({ ...dotMapping, decimalSeparator: "," })
    );
    expect(result.warnings).toEqual([]);
    expect(result.rows.map((r) => r.amount)).toEqual([12.5, 1234.56, 3.9]);
  });

  it("does not warn for ordinary dot-decimal files", () => {
    const matrix = parseCsv(REVOLUT_CSV);
    const result = normalizeWithPreset(matrix, detectPreset(matrix[0])!);
    expect(result.warnings).toEqual([]);
  });

  it("still parses dot-thousands files correctly under '.'", () => {
    const csv = ["Date,Description,Amount", "2024-02-01,Bonus,\"1,234.56\""].join("\n");
    const result = normalizeWithPreset(parseCsv(csv), buildGenericPreset(dotMapping));
    expect(result.rows[0].amount).toBe(1234.56);
    expect(result.warnings).toEqual([]);
  });
});

describe("analyzeTransactionsCsv", () => {
  it("recognises Numa's own export header as native", () => {
    const native = "date,description,kind,amount,currency,category,account,notes\n2024-01-01,Coffee,expense,3.5,EUR,,,";
    const analysis = analyzeTransactionsCsv(native);
    expect(analysis.kind).toBe("native");
    expect(isNumaTransactionsHeader(analysis.matrix[0])).toBe(true);
  });

  it("routes known bank exports to their preset", () => {
    const analysis = analyzeTransactionsCsv(REVOLUT_CSV);
    expect(analysis.kind).toBe("preset");
    expect(analysis.preset?.id).toBe("revolut");
    expect(analysis.delimiter).toBe(",");
  });

  it("retries with ';' when the comma parse collapses to one column", () => {
    const analysis = analyzeTransactionsCsv(GERMAN_BANK_CSV);
    expect(analysis.delimiter).toBe(";");
    expect(analysis.kind).toBe("unknown");
    expect(analysis.matrix[0]).toHaveLength(4);
  });

  it("classifies empty input as empty", () => {
    expect(analyzeTransactionsCsv("").kind).toBe("empty");
    expect(analyzeTransactionsCsv("\n\n").kind).toBe("empty");
  });
});
