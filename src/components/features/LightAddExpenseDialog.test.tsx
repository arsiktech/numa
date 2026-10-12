import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LightAddExpenseDialog } from "./LightAddExpenseDialog";

const mocks = vi.hoisted(() => ({ create: vi.fn(), close: vi.fn(), portfolioId: "p", userId: "me", categoryName: "Coffee", receipt: 0 }));
vi.mock("@/services/store", () => ({
  useCurrentPortfolioId: () => [mocks.portfolioId],
  usePortfolio: (id: string) => ({ id, name: "Personal", defaultCurrency: "EUR" }),
  useCurrentUser: () => ({ id: mocks.userId }),
  useCategories: () => [{ id: "coffee", portfolioId: "p", kind: "expense", name: mocks.categoryName, color: "mint", icon: "coffee", sortOrder: 0 }]
}));
vi.mock("@/services/domainActions", () => ({ useDomainActions: () => ({ createTransaction: mocks.create }) }));
vi.mock("@/services/writeQueue", () => ({ makeClientMutationId: () => `entry-${++mocks.receipt}` }));
vi.mock("./ScanDialog", () => ({ ScanDialog: () => null }));
vi.mock("./VoiceDialog", () => ({ VoiceDialog: () => null }));
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  Object.assign(mocks, { portfolioId: "p", userId: "me", categoryName: "Coffee", receipt: 0 });
  mocks.create.mockResolvedValue({ queued: false });
});
function open() { return render(<LightAddExpenseDialog open onClose={mocks.close} />); }
function fill() {
  fireEvent.click(screen.getByRole("button", { name: "1" }));
  fireEvent.click(screen.getByRole("button", { name: "2" }));
  fireEvent.change(screen.getByLabelText("Note"), { target: { value: "Lunch" } });
}
function saveButton() { return screen.getByRole("button", { name: /^Add .* to Coffee$/ }); }

it("preserves keypad income capture and assigns a receipt", async () => {
  open(); fill(); fireEvent.click(screen.getByRole("tab", { name: "Income" }));
  fireEvent.click(screen.getByRole("button", { name: /^Add .* income/ }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ portfolioId: "p", createdByUserId: "me", kind: "income", amount: 12, description: "Lunch", categoryId: undefined }), { clientMutationId: "entry-1" });
});

it("keeps exact payload and receipt for retry after a category refresh", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Connection interrupted"));
  const view = open(); fill(); fireEvent.click(saveButton());
  await screen.findByRole("alert");
  const first = mocks.create.mock.calls[0];
  expect(screen.getByLabelText("Note")).toBeDisabled();
  expect(screen.getByLabelText("Expense date")).toBeDisabled();
  expect(screen.getByRole("button", { name: "2" })).toBeDisabled();
  mocks.categoryName = "Renamed category";
  view.rerender(<LightAddExpenseDialog open onClose={mocks.close} />);
  fireEvent.click(screen.getByRole("button", { name: "Retry save" }));
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[1]).toEqual(first);
  expect(mocks.receipt).toBe(1);
});

it("blocks repeated save and every dismissal route while saving", async () => {
  let resolve!: (value: { queued: boolean }) => void;
  mocks.create.mockImplementation(() => new Promise(done => { resolve = done; }));
  const view = open(); fill();
  const save = saveButton();
  act(() => { save.click(); save.click(); });
  expect(mocks.create).toHaveBeenCalledOnce();
  fireEvent.keyDown(document, { key: "Escape" });
  fireEvent.click(screen.getByRole("button", { name: "Close add expense" }));
  fireEvent.click(view.container.firstElementChild!);
  expect(mocks.close).not.toHaveBeenCalled();
  await act(async () => resolve({ queued: false }));
  expect(mocks.close).toHaveBeenCalledOnce();
});

it.each(["portfolio", "user"])("blocks a draft after its %s changes", target => {
  const view = open(); fill();
  if (target === "portfolio") mocks.portfolioId = "other"; else mocks.userId = "other";
  view.rerender(<LightAddExpenseDialog open onClose={mocks.close} />);
  expect(saveButton()).toBeDisabled();
  fireEvent.click(saveButton());
  expect(mocks.create).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("account or space changed");
});

it("shows queued truthfully and cannot add the queued entry again", async () => {
  mocks.create.mockResolvedValue({ queued: true });
  open(); fill(); fireEvent.click(saveButton());
  await screen.findByRole("dialog", { name: "Waiting to sync" });
  expect(screen.getByRole("status")).toHaveTextContent("not confirmed in the cloud");
  expect(mocks.close).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(mocks.close).toHaveBeenCalledOnce();
  expect(mocks.create).toHaveBeenCalledOnce();
});

it("starts a fresh draft and receipt after closing and reopening", async () => {
  mocks.create.mockRejectedValueOnce(new Error("Interrupted"));
  const view = open(); fill(); fireEvent.click(saveButton());
  await screen.findByRole("alert");
  view.rerender(<LightAddExpenseDialog open={false} onClose={mocks.close} />);
  view.rerender(<LightAddExpenseDialog open onClose={mocks.close} />);
  expect(screen.getByLabelText("Note")).toHaveValue("");
  fill(); fireEvent.click(saveButton());
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[1]![1]).toEqual({ clientMutationId: "entry-2" });
});
