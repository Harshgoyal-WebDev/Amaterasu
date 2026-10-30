"use client";

import { useSyncExternalStore } from "react";
import { uiStore } from "../state";

const getServer = () => uiStore.get();

/** Subscribe a component to one slice of the low-frequency UI store. */
export default function useUiStore(select) {
  const state = useSyncExternalStore(uiStore.subscribe, uiStore.get, getServer);
  return select(state);
}
