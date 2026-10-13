// @vitest-environment node
import { describe, expect, it } from "vitest";
import { classifyExport, classifyWorkbook, exportUrl, parseSheetLink, redirectTarget } from "./lib/googleSheets";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abc";

describe("parseSheetLink", () => {
  it("reads the sheet and the open tab from the links Google Sheets hands out", () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing`)).toEqual({ id: ID, gid: null });
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?pli=1&gid=1595306914#gid=1595306914`)).toEqual({ id: ID, gid: "1595306914" });
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=0`)).toEqual({ id: ID, gid: "0" });
    expect(parseSheetLink(`docs.google.com/spreadsheets/u/1/d/${ID}/htmlview`)).toEqual({ id: ID, gid: null });
    expect(parseSheetLink(`  https://docs.google.com/spreadsheets/d/${ID}  `)).toEqual({ id: ID, gid: null });
  });

  it("refuses anything that isn't a Google Sheet", () => {
    for (const bad of [
      "", "hello", `http://docs.google.com/spreadsheets/d/${ID}`, `https://evil.example/spreadsheets/d/${ID}`,
      `https://docs.google.com.evil.example/spreadsheets/d/${ID}`, `https://docs.google.com/document/d/${ID}/edit`,
      "https://docs.google.com/spreadsheets/d/short/edit",
    ]) expect(parseSheetLink(bad), bad).toBeNull();
  });

  it("keeps only the digits of a tab ID", () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=1;drop`)).toEqual({ id: ID, gid: "1" });
  });

  it("always builds Google's own export address", () => {
    expect(exportUrl({ id: ID, gid: "42" })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=csv&gid=42`);
    expect(exportUrl({ id: ID, gid: null })).toBe(`https://docs.google.com/spreadsheets/d/${ID}/export?format=xlsx`);
  });
});

describe("classifyExport", () => {
  it("passes CSV through", () => {
    expect(classifyExport(200, "text/csv; charset=utf-8", "Date,Total\n1/2/2026,5")).toEqual({ status: "ok", csv: "Date,Total\n1/2/2026,5" });
  });
  it("tells a private sheet from a missing one", () => {
    expect(classifyExport(401, "text/html", "<html>")).toEqual({ status: "private" });
    expect(classifyExport(200, "text/html; charset=utf-8", "<!DOCTYPE html><html>sign in")).toEqual({ status: "private" });
    expect(classifyExport(404, "text/html", "")).toEqual({ status: "missing" });
    expect(classifyExport(500, "text/html", "")).toEqual({ status: "failed" });
  });
  it("refuses a huge tab", () => {
    expect(classifyExport(200, "text/csv", "x".repeat(5_000_001))).toEqual({ status: "tooBig" });
  });
});

describe("classifyWorkbook", () => {
  const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  it("passes an Excel workbook on as base64", () => {
    expect(classifyWorkbook(200, XLSX, new Uint8Array([80, 75, 3, 4]))).toEqual({ status: "ok", xlsx: "UEsDBA==" });
  });
  it("reads a sign-in page as private, and refuses a huge file", () => {
    expect(classifyWorkbook(200, "text/html", new Uint8Array([60]))).toEqual({ status: "private" });
    expect(classifyWorkbook(200, XLSX, new Uint8Array(5_000_001))).toEqual({ status: "tooBig" });
  });
});

describe("redirectTarget", () => {
  const from = `https://docs.google.com/spreadsheets/d/${ID}/export?format=csv`;
  it("follows Google's file host for a shared sheet", () => {
    expect(redirectTarget("https://doc-00-c0-sheets.googleusercontent.com/export/abc?format=csv", from)).toEqual({ kind: "follow", url: "https://doc-00-c0-sheets.googleusercontent.com/export/abc?format=csv" });
    expect(redirectTarget("/spreadsheets/d/x/export", from)).toEqual({ kind: "follow", url: "https://docs.google.com/spreadsheets/d/x/export" });
  });
  it("reads a sign-in redirect as a private sheet", () => {
    expect(redirectTarget("https://accounts.google.com/ServiceLogin?continue=x", from)).toEqual({ kind: "private" });
  });
  it("refuses any other host", () => {
    for (const bad of [null, "https://evil.example/x", "http://doc-00.googleusercontent.com/x", "https://googleusercontent.com.evil.example/x", "https://a.b.googleusercontent.com/x"]) {
      expect(redirectTarget(bad, from), String(bad)).toEqual({ kind: "refused" });
    }
  });
});
