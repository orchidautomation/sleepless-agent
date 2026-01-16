import { LocalStorage } from "@raycast/api";
import type { HistoryItem } from "./types";

const HISTORY_KEY = "sleepless-agent-history";
const MAX_HISTORY_ITEMS = 50;

export async function getHistory(): Promise<HistoryItem[]> {
  const stored = await LocalStorage.getItem<string>(HISTORY_KEY);
  if (!stored) return [];

  try {
    return JSON.parse(stored) as HistoryItem[];
  } catch {
    return [];
  }
}

export async function addToHistory(item: Omit<HistoryItem, "timestamp">): Promise<void> {
  const history = await getHistory();

  const newItem: HistoryItem = {
    ...item,
    timestamp: Date.now(),
  };

  // Add to beginning, limit to max items
  const updatedHistory = [newItem, ...history].slice(0, MAX_HISTORY_ITEMS);

  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
}

export async function clearHistory(): Promise<void> {
  await LocalStorage.removeItem(HISTORY_KEY);
}

export async function removeFromHistory(id: string): Promise<void> {
  const history = await getHistory();
  const updatedHistory = history.filter((item) => item.id !== id);
  await LocalStorage.setItem(HISTORY_KEY, JSON.stringify(updatedHistory));
}
