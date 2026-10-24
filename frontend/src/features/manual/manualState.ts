import { create } from "zustand";
import { inputState } from "../../world/inputOwnership";
import type { ManualPage } from "./types";

export type ManualPhase = "closed" | "opening" | "open" | "closing";
export const MANUAL_OPEN_MS = 1000;
export const MANUAL_CLOSE_MS = 500;
export const MANUAL_REDUCED_MS = 120;
export const useManual = create<{
  open: boolean;
  page: ManualPage;
  phase: ManualPhase;
}>(() => ({
  open: false,
  page: "catalog",
  phase: "closed",
}));

export function openManual(page?: ManualPage) {
  const state = useManual.getState();
  if (state.phase === "opening" || state.phase === "closing") return;
  if (state.open) {
    if (page) useManual.setState({ page });
    return;
  }
  // Synchronous guard also blocks a pointer release/held key in this event turn.
  inputState.manualOpen = true;
  window.dispatchEvent(new Event("ontop-clear-input"));
  window.dispatchEvent(new Event("ontop-manual-open"));
  useManual.setState({
    open: true,
    phase: "opening",
    ...(page ? { page } : {}),
  });
}

export function closeManual() {
  if (!useManual.getState().open || useManual.getState().phase === "closing")
    return;
  // Keep the modal and world-input lock until the paper has finished rolling up.
  useManual.setState({ phase: "closing" });
}

export function finishManualOpening() {
  if (useManual.getState().phase === "opening")
    useManual.setState({ phase: "open" });
}

export function finishManualClosing() {
  if (useManual.getState().phase !== "closing") return;
  useManual.setState({ open: false, phase: "closed" });
  inputState.manualOpen = false;
  window.dispatchEvent(new Event("ontop-clear-input"));
}

/** Session/park teardown must release only this modal's ownership. */
export function resetManual() {
  if (!useManual.getState().open) return;
  useManual.setState({open:false, phase:"closed"});
  inputState.manualOpen = false;
  window.dispatchEvent(new Event("ontop-clear-input"));
}
