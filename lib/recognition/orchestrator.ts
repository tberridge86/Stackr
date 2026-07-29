import type {
  IdentifiedCard,
  IdentifyCardsDetailedResult,
  ScanIdentifyDiagnostics,
  ScanIdentifyHints,
} from '../cardSight';
import { getRecognitionFeatureFlags, type RecognitionFeatureFlags } from './featureFlags';
import {
  buildLegacyRecognitionRequest,
  existingLegacyEngine,
  recognitionResultToLegacyIdentifyResult,
} from './engines/legacyEngine';
import { localOnDeviceV1Engine } from './engines/localOnDeviceV1';
import { stackrApiV1RecognitionEngine } from './engines/stackrApiV1';
import {
  type RecognitionEngine,
  type RecognitionRequest,
  type RecognitionResult,
} from './types';
import {
  createRecognitionRequest,
  recognizeCard as recognizeCardCore,
} from './orchestratorCore';

export type {
  IdentifiedCard,
  IdentifyCardsDetailedResult,
  ScanIdentifyDiagnostics,
  ScanIdentifyHints,
};

export type RecognitionOrchestratorOptions = {
  featureFlags?: RecognitionFeatureFlags;
  engines?: {
    legacy?: RecognitionEngine;
    local?: RecognitionEngine;
    stackrApi?: RecognitionEngine;
  };
  engineTimeoutMs?: number;
};

export async function recognizeCard(
  request: RecognitionRequest,
  options: RecognitionOrchestratorOptions = {}
): Promise<RecognitionResult> {
  return recognizeCardCore(request, {
    ...options,
    engines: {
      local: options.engines?.local ?? localOnDeviceV1Engine,
      stackrApi: options.engines?.stackrApi ?? stackrApiV1RecognitionEngine,
      legacy: options.engines?.legacy ?? existingLegacyEngine,
    },
  });
}

export async function identifyCardsDetailed(
  images: string[],
  binderId?: string,
  hints?: ScanIdentifyHints
): Promise<IdentifyCardsDetailedResult> {
  const flags = getRecognitionFeatureFlags();
  const request = buildLegacyRecognitionRequest(images, binderId, hints);
  const result = await recognizeCard(request, { featureFlags: flags });
  return recognitionResultToLegacyIdentifyResult(result);
}

export async function identifyCards(images: string[], binderId?: string): Promise<IdentifiedCard[]> {
  const result = await identifyCardsDetailed(images, binderId);
  return result.cards;
}

export { createRecognitionRequest };
