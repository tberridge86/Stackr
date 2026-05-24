export type ScanCandidate = {
  id?: string;
  name: string;
  number?: string | null;
  setName?: string | null;
  setCode?: string | null;
  confidence?: number | null;
  source: 'ximilar';
  resolvedCard?: any | null;
};

export type ScanSuccessResponse = {
  ok: true;
  provider: 'ximilar';
  requiresConfirmation: true;
  candidates: ScanCandidate[];
  rawDebug?: any;
};

export type ScanErrorStage =
  | 'image'
  | 'upload'
  | 'backend'
  | 'ximilar'
  | 'normalisation'
  | 'card_lookup'
  | 'render';

export type ScanErrorResponse = {
  ok: false;
  provider?: 'ximilar';
  stage: ScanErrorStage;
  code: string;
  message: string;
  details?: string;
  httpStatus?: number;
};

export type NormalisedScanResponse = ScanSuccessResponse | ScanErrorResponse;
