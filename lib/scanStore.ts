import { identifyCards, type IdentifiedCard } from './cardSight';

type ScanCallback = (base64: string) => void;
let _callback: ScanCallback | null = null;

export interface QueuedScan {
  base64: string;
}

export interface ScanState {
  scanType: 'market' | 'binder';
  binderId: string | null;
  scannedCards: QueuedScan[];
  processedCards: IdentifiedCard[];
  duplicates: string[];
  isContinuous: boolean;
  setType: (type: 'market' | 'binder') => void;
  setBinder: (id: string) => void;
  setContinuous: (value: boolean) => void;
  addScanned: (base64: string) => void;
  clear: () => void;
  processQueue: () => Promise<IdentifiedCard[]>;
  triggerCallback: (base64: string) => void;
}

const listeners = new Set<() => void>();

const state: ScanState = {
  scanType: 'market',
  binderId: null,
  scannedCards: [],
  processedCards: [],
  duplicates: [],
  isContinuous: false,
  setType: (type) => {
    state.scanType = type;
    state.scannedCards = [];
    state.processedCards = [];
    state.duplicates = [];
    notify();
  },
  setBinder: (id) => {
    state.binderId = id;
    notify();
  },
  setContinuous: (value) => {
    state.isContinuous = value;
    notify();
  },
  addScanned: (base64) => {
    state.scannedCards = [...state.scannedCards, { base64 }];
    notify();
  },
  clear: () => {
    state.scannedCards = [];
    state.processedCards = [];
    state.duplicates = [];
    notify();
  },
  processQueue: async () => {
    if (!state.scannedCards.length) return [];

    const results = await identifyCards(
      state.scannedCards.map((c) => c.base64),
      state.binderId ?? undefined
    );

    const duplicates = results
      .filter((r) => r.isDuplicate)
      .map((d) => d.name ?? '')
      .filter(Boolean);

    state.duplicates = duplicates;
    state.processedCards = results;
    notify();
    return results;
  },
  triggerCallback: (base64: string) => {
    _callback?.(base64);
    _callback = null;
  },
};

function notify() {
  listeners.forEach((listener) => listener());
}

export function useScanStore() {
  return state;
}

(useScanStore as any).subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

(useScanStore as any).getState = () => state;

export const scanStore = {
  setCallback: (cb: ScanCallback) => {
    _callback = cb;
    state.clear();
  },
  triggerCallback: (base64: string) => {
    _callback?.(base64);
    _callback = null;
  },
  clear: () => {
    _callback = null;
    state.clear();
  },
};
