import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AddHoldingDialog } from "./AddHoldingDialog";
import type { Holding } from "@/lib/types";
const mocks = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), close: vi.fn(), portfolioId: "p" }));
vi.mock("@/services/store", () => ({ useCurrentPortfolioId: () => [mocks.portfolioId], usePortfolio: () => ({ id: mocks.portfolioId, name: "Synthetic" }) }));
vi.mock("@/services/domainActions", () => ({ useDomainActions: () => ({ createHolding: mocks.create, updateHolding: mocks.update }) }));
vi.mock("@/services/writeQueue", () => ({ makeClientMutationId: () => "holding-intent" }));
afterEach(cleanup);
beforeEach(() => { vi.clearAllMocks(); mocks.portfolioId = "p"; });
it("does not move an unsaved draft to a replacement portfolio", async () => {
  const view = render(<AddHoldingDialog open onClose={mocks.close} />);
  fill();
  mocks.portfolioId = "replacement";
  view.rerender(<AddHoldingDialog open onClose={mocks.close} />);
  fireEvent.click(screen.getByRole("button", { name: "Add holding" }));
  expect((await screen.findByRole("alert")).textContent).toContain("active portfolio changed");
  expect(mocks.create).not.toHaveBeenCalled();
});
it("can edit an existing fine fractional holding without changing its quantity", async () => {
  mocks.update.mockResolvedValue({ id: "h", queued: false });
  const holding: Holding = { id: "h", portfolioId: "p", symbol: "BTC", name: "Bitcoin", kind: "crypto", quantity: 0.00000001, costBasis: 0.01, currency: "USD", acquiredAt: 1 };
  render(<AddHoldingDialog open onClose={mocks.close} holding={holding} />);
  fireEvent.click(screen.getByRole("button", { name: "Save changes" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.update).toHaveBeenCalledWith("h", expect.objectContaining({ quantity: 0.00000001, costBasis: 0.01 }), "p", "holding-intent");
});
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "Enter details myself" }));
  fireEvent.change(screen.getByPlaceholderText("AAPL · BTC · VOO"), { target: { value: "AAPL" } });
  fireEvent.change(screen.getByPlaceholderText("0"), { target: { value: "2" } });
  fireEvent.change(screen.getByPlaceholderText("What you paid in total"), { target: { value: "123.45" } });
}
it("offers only server-supported currencies and submits purchase atomically", async () => {
  mocks.create.mockResolvedValue({ id: "h", queued: true });
  render(<AddHoldingDialog open onClose={mocks.close} />);
  fill();
  const choices = screen.getAllByRole("combobox");
  const currency = choices[choices.length - 1]!;
  expect([...currency.querySelectorAll("option")].map(option => option.value)).toEqual(["EUR", "USD"]);
  fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ symbol: "AAPL", quantity: 2, costBasis: 123.45 }), { recordPurchase: true, clientMutationId: "holding-intent" });
});
it("blocks duplicate clicks and retries the exact same intent after failure", async () => {
  let reject!: (reason: Error) => void;
  mocks.create.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; })).mockResolvedValueOnce({ id: "h" });
  render(<AddHoldingDialog open onClose={mocks.close} />);
  fill();
  const form = screen.getByRole("dialog").querySelector("form")!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(mocks.create).toHaveBeenCalledOnce();
  reject(new Error("Connection interrupted"));
  await screen.findByRole("alert");
  expect(mocks.close).not.toHaveBeenCalled();
  fireEvent.submit(form);
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
});
