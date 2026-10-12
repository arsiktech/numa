import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UniversalCaptureDialog } from "./UniversalCaptureDialog";
const mocks = vi.hoisted(() => ({ create: vi.fn(), pod: vi.fn(), close: vi.fn(), portfolioId: "p", userId: "me", includePod: false, member: true, extraMember: false, receipt: 0 }));
vi.mock("@/services/store", () => ({
  useCurrentPortfolioId: () => [mocks.portfolioId], usePortfolio: (id: string) => ({ id, name: "Personal", defaultCurrency: "EUR" }),
  useCurrentUser: () => ({ id: mocks.userId, email: "qa@example.invalid" }), useCategories: () => [], useAssets: () => [],
  useMoneyPods: () => mocks.includePod ? [{ id: "pod", name: "Trip", currency: "USD" }] : [],
  usePodMembers: () => [{ id: "m1", displayName: "Alex", linkedUserId: mocks.member ? "me" : "another-user" }, { id: "m2", displayName: "Sam" }, ...(mocks.extraMember ? [{ id: "m3", displayName: "Jo" }] : [])]
}));
vi.mock("@/services/domainActions", () => ({ useDomainActions: () => ({ createTransaction: mocks.create }) }));
vi.mock("@/services/podActions", () => ({ usePodActions: () => ({ addPodExpense: mocks.pod }) }));
vi.mock("@/services/writeQueue", () => ({ makeClientMutationId: () => `entry-${++mocks.receipt}` }));
vi.mock("@/lib/appMode", () => ({ useAppMode: () => ["advanced"] }));
afterEach(cleanup);
beforeEach(() => { vi.resetAllMocks(); Object.assign(mocks, { portfolioId: "p", userId: "me", includePod: false, member: true, extraMember: false, receipt: 0 }); mocks.create.mockResolvedValue({ queued: false }); mocks.pod.mockResolvedValue({ queued: false }); });
function open() { return render(<UniversalCaptureDialog open onClose={mocks.close} />); }
function fill() {
  fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "12,50" } });
  fireEvent.change(screen.getByLabelText("What was it for?"), { target: { value: "Lunch" } });
}
function submit() { fireEvent.submit(screen.getByRole("dialog").querySelector("form")!); }
it("starts with a blank amount-first form and saves an explicit income without guessing category/account", async () => {
  open();
  expect(screen.getByRole("button", { name: "Save expense" })).toBeDisabled();
  expect(screen.queryByLabelText("Save to")).not.toBeInTheDocument();
  fill(); fireEvent.click(screen.getByRole("button", { name: "Income" })); submit();
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ kind: "income", amount: 12.5, portfolioId: "p", categoryId: undefined, accountId: undefined }), { clientMutationId: "entry-1" });
});
it("blocks double submission and retries unchanged payload after an uncertain save", async () => {
  let reject!: (reason: Error) => void;
  mocks.create.mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  open(); fill(); submit(); submit(); expect(mocks.create).toHaveBeenCalledOnce();
  reject(new Error("Connection interrupted")); await screen.findByRole("alert");
  expect(screen.getByRole("list", { name: "Entries to save" })).toHaveTextContent("Lunch");
  submit(); await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create.mock.calls[1]).toEqual(mocks.create.mock.calls[0]);
});
it("requires a full batch review and retries only the unfinished item", async () => {
  mocks.create.mockResolvedValueOnce({ queued: false }).mockRejectedValueOnce(new Error("Interrupted")).mockResolvedValueOnce({ queued: false });
  open(); fireEvent.click(screen.getByRole("button", { name: "Add several at once" }));
  fireEvent.change(screen.getByLabelText("Entries"), { target: { value: "Coffee 5.50\nLunch 12\nGroceries 80\nDinner 20" } });
  submit(); expect(mocks.create).not.toHaveBeenCalled();
  expect(screen.getByRole("list", { name: "Entries to save" }).children).toHaveLength(4);
  submit(); await screen.findByRole("alert");
  expect(screen.getByRole("status")).toHaveTextContent("1 saved · 0 queued · 3 remaining");
  expect(screen.queryByText("Nothing is saved until you confirm below.")).not.toBeInTheDocument();
  submit();
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.create).toHaveBeenCalledTimes(5);
  expect(mocks.create.mock.calls[2]).toEqual(mocks.create.mock.calls[1]);
  expect(mocks.create.mock.calls.filter(call => call[0].description === "Coffee")).toHaveLength(1);
});
it("does not claim cloud success for queued entries", async () => {
  mocks.create.mockResolvedValue({ queued: true }); open(); fill(); submit();
  await screen.findByRole("dialog", { name: "Waiting to sync" });
  expect(screen.getByRole("status").textContent).toContain("not confirmed in the cloud");
  expect(mocks.close).not.toHaveBeenCalled();
});
it.each(["portfolio", "user"])("blocks retargeting after the current %s changes", async target => {
  const view = open(); fill();
  if (target === "portfolio") mocks.portfolioId = "replacement"; else mocks.userId = "other";
  view.rerender(<UniversalCaptureDialog open onClose={mocks.close} />);
  submit(); expect(mocks.create).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Save expense" })).toBeDisabled();
});
it("makes shared payer and split explicit, never defaults to another person", async () => {
  mocks.includePod = true; mocks.member = false; open(); fill();
  fireEvent.change(screen.getByLabelText("Save to"), { target: { value: "pod" } });
  expect(screen.getByRole("button", { name: "Save expense" })).toBeDisabled();
  expect(screen.getByText("Split equally between Alex, Sam.")).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Paid by"), { target: { value: "m2" } }); submit();
  await waitFor(() => expect(mocks.close).toHaveBeenCalledOnce());
  expect(mocks.pod).toHaveBeenCalledWith(expect.objectContaining({ paidByMemberId: "m2", participantMemberIds: ["m1", "m2"], amount: 12.5, currency: "USD", clientMutationId: "entry-1" }));
  expect(mocks.create).not.toHaveBeenCalled();
});

it("keeps the reviewed shared split and target unchanged after a partial save", async () => {
  mocks.includePod = true;
  mocks.pod.mockResolvedValueOnce({ queued: true }).mockRejectedValueOnce(new Error("Interrupted")).mockResolvedValueOnce({ queued: false });
  const view = open();
  fireEvent.change(screen.getByLabelText("Save to"), { target: { value: "pod" } });
  fireEvent.click(screen.getByRole("button", { name: "Add several at once" }));
  fireEvent.change(screen.getByLabelText("Entries"), { target: { value: "Coffee 5.50\nLunch 12" } });
  submit(); submit(); await screen.findByRole("alert");
  expect(screen.getByRole("status")).toHaveTextContent("0 saved · 1 queued · 1 remaining");
  mocks.extraMember = true; view.rerender(<UniversalCaptureDialog open onClose={mocks.close} />);
  expect(screen.getByText("Paid by Alex. Split equally between Alex, Sam.")).toBeInTheDocument();
  submit(); await screen.findByRole("dialog", { name: "Waiting to sync" });
  expect(screen.getByRole("status")).toHaveTextContent("1 saved · 1 queued on this device");
  expect(mocks.pod.mock.calls[2]).toEqual(mocks.pod.mock.calls[1]);
  expect(mocks.pod.mock.calls[2]![0].participantMemberIds).toEqual(["m1", "m2"]);
});
