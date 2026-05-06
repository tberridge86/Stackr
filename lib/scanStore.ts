type ScanCallback = (base64: string) => void;

let _callback: ScanCallback | null = null;

export const scanStore = {
  setCallback: (cb: ScanCallback) => { _callback = cb; },
  triggerCallback: (base64: string) => { _callback?.(base64); _callback = null; },
  clear: () => { _callback = null; },
};