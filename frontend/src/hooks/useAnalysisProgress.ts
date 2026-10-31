import { useEffect, useSyncExternalStore } from "react";
import { getAnalysisProgress } from "../api/repositories";
import type { AnalysisProgress } from "../api/types";

// The backend's progress record per repository, shared by cards and the
// drawer. One poll loop per repository, once a second, only while something
// shows a running analysis; one last read when it stops, so a failed stage is
// known. Reads come from the server's memory: no AI request, no tokens.

const POLL_INTERVAL_MS = 1_000;

const records = new Map<string, AnalysisProgress | null>();
const subscribers = new Map<string, number>();
const looping = new Set<string>();
const listeners = new Set<() => void>();

const notify = () => listeners.forEach((listener) => listener());
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function read(repositoryId: string) {
  try {
    records.set(repositoryId, await getAnalysisProgress(repositoryId));
    notify();
  } catch {
    // A missed read keeps the last known progress; the next one may succeed.
  }
}

async function loop(repositoryId: string) {
  if (looping.has(repositoryId)) return;
  looping.add(repositoryId);
  while ((subscribers.get(repositoryId) ?? 0) > 0) {
    await read(repositoryId);
    await wait(POLL_INTERVAL_MS);
  }
  looping.delete(repositoryId);
  await read(repositoryId);
}

function watch(repositoryId: string): () => void {
  subscribers.set(repositoryId, (subscribers.get(repositoryId) ?? 0) + 1);
  void loop(repositoryId);
  return () => subscribers.set(repositoryId, (subscribers.get(repositoryId) ?? 1) - 1);
}

// A new run starts from nothing (not from the previous run's record).
export function clearAnalysisProgress(repositoryId: string) {
  records.delete(repositoryId);
  notify();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

// The repository's progress; polled while `active` (an analysis is running).
export function useAnalysisProgress(repositoryId: string, active: boolean): AnalysisProgress | null {
  useEffect(() => (active ? watch(repositoryId) : undefined), [repositoryId, active]);
  return useSyncExternalStore(subscribe, () => records.get(repositoryId) ?? null);
}
