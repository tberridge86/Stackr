export const CARD_IDENTITY_ONNX_EXPORT_SCHEMA_VERSION = 'stackr-card-identity-onnx-export-v1.0.0';
export const CARD_IDENTITY_ONNX_MODEL_VERSION = 'stackr-card-identity-onnx-v0.0.0-blocked';

export type CardIdentityOnnxExportBlocker =
  | 'no_approved_embedding_model'
  | 'source_checkpoint_has_no_weights'
  | 'no_selected_source_baseline'
  | 'pytorch_onnx_parity_unavailable'
  | 'test_image_count_below_1000'
  | 'quantization_calibration_dataset_missing'
  | 'quantized_accuracy_unmeasured';

export type CardIdentityPreprocessingSpec = {
  inputDimensions: {
    batch: 1;
    channels: 3;
    height: 320;
    width: 224;
    dynamicDimensions: false;
  };
  colourOrder: 'RGB';
  pixelRange: 'float32_0_to_1';
  mean: [number, number, number];
  std: [number, number, number];
  resizeAlgorithm: 'bilinear';
  cropBehaviour: 'use_native_rectified_full_card_preserve_complete_card_no_square_crop';
  tensorLayout: 'NCHW';
  output: {
    dimensions: 128;
    l2Normalised: true;
  };
};

export type CardIdentityOnnxValidation = {
  requiredTestImages: 1000;
  testedImages: number;
  pytorchOutputAvailable: boolean;
  onnxOutputAvailable: boolean;
  maximumEmbeddingDifference: number | null;
  meanEmbeddingDifference: number | null;
  nearestNeighbourParity: number | null;
};

export type CardIdentityOnnxQuantizationReport = {
  fullPrecision: {
    status: 'blocked' | 'exported';
    file: string;
    sha256: string | null;
    retrievalAccuracy: number | null;
    hardNegativeAccuracy: number | null;
    exactVariantAccuracy: number | null;
  };
  fp16: {
    status: 'blocked' | 'exported' | 'unsupported';
    file: string | null;
    sha256: string | null;
    retrievalAccuracy: number | null;
    hardNegativeAccuracy: number | null;
    exactVariantAccuracy: number | null;
  };
  int8: {
    status: 'blocked' | 'candidate' | 'rejected' | 'selected';
    file: string | null;
    sha256: string | null;
    representativeCalibrationImages: number;
    retrievalAccuracy: number | null;
    hardNegativeAccuracy: number | null;
    exactVariantAccuracy: number | null;
    rejectionReason: string;
  };
};

export type CardIdentityOnnxBenchmark = {
  modelLoadTimeMs: number | null;
  warmInferenceMs: number | null;
  coldInferenceMs: number | null;
  memoryUseBytes: number | null;
  outputParity: number | null;
  modelFileSizeBytes: number | null;
};

export type EmbeddingSourceRun = {
  status?: string;
  blockers?: string[];
  selectedBaseline?: string | null;
  datasetManifestSha256?: string | null;
  datasetVersion?: string | null;
  sourceCommitHash?: string | null;
  config?: {
    modelVersion?: string | null;
    input?: {
      width?: number;
      height?: number;
    };
    embedding?: {
      dimensions?: number;
      l2Normalised?: boolean;
    };
  };
};

export type EmbeddingCheckpointManifest = {
  modelVersion?: string | null;
  status?: string;
  containsWeights?: boolean;
  blockers?: string[];
  datasetManifestSha256?: string | null;
  sourceCommitHash?: string | null;
};

export type CardIdentityOnnxManifest = {
  schemaVersion: typeof CARD_IDENTITY_ONNX_EXPORT_SCHEMA_VERSION;
  modelVersion: string;
  status: 'blocked' | 'exported';
  generatedAt: string;
  immutableVersion: true;
  approvedForMobileInference: boolean;
  blockers: CardIdentityOnnxExportBlocker[];
  sourceModel: {
    modelVersion: string | null;
    status: string | null;
    selectedBaseline: string | null;
    checkpointContainsWeights: boolean;
    datasetManifestSha256: string | null;
    datasetVersion: string | null;
    sourceCommitHash: string | null;
  };
  preprocessing: CardIdentityPreprocessingSpec;
  validation: CardIdentityOnnxValidation;
  quantization: CardIdentityOnnxQuantizationReport;
  benchmark: CardIdentityOnnxBenchmark;
  files: {
    fullPrecisionModel: {
      path: 'assets/models/card_identity/model.onnx';
      exists: boolean;
      sha256: string | null;
    };
    modelManifest: {
      path: 'assets/models/card_identity/model-manifest.json';
    };
    modelCard: {
      path: 'assets/models/card_identity/MODEL_CARD.md';
    };
  };
  license: {
    modelWeights: 'none_released';
    notes: string;
  };
};

export function createCardIdentityPreprocessingSpec(): CardIdentityPreprocessingSpec {
  return {
    inputDimensions: {
      batch: 1,
      channels: 3,
      height: 320,
      width: 224,
      dynamicDimensions: false,
    },
    colourOrder: 'RGB',
    pixelRange: 'float32_0_to_1',
    mean: [0.485, 0.456, 0.406],
    std: [0.229, 0.224, 0.225],
    resizeAlgorithm: 'bilinear',
    cropBehaviour: 'use_native_rectified_full_card_preserve_complete_card_no_square_crop',
    tensorLayout: 'NCHW',
    output: {
      dimensions: 128,
      l2Normalised: true,
    },
  };
}

export function getCardIdentityOnnxExportBlockers({
  sourceRun,
  checkpoint,
  testImageCount,
  calibrationImageCount,
}: {
  sourceRun: EmbeddingSourceRun | null;
  checkpoint: EmbeddingCheckpointManifest | null;
  testImageCount: number;
  calibrationImageCount: number;
}): CardIdentityOnnxExportBlocker[] {
  const blockers: CardIdentityOnnxExportBlocker[] = [];
  if (!sourceRun || sourceRun.status !== 'ready_to_train' || sourceRun.blockers?.length) {
    blockers.push('no_approved_embedding_model');
  }
  if (!checkpoint?.containsWeights) {
    blockers.push('source_checkpoint_has_no_weights');
  }
  if (!sourceRun?.selectedBaseline) {
    blockers.push('no_selected_source_baseline');
  }
  if (testImageCount < 1000) {
    blockers.push('test_image_count_below_1000');
  }
  if (calibrationImageCount <= 0) {
    blockers.push('quantization_calibration_dataset_missing');
  }
  blockers.push('pytorch_onnx_parity_unavailable');
  blockers.push('quantized_accuracy_unmeasured');
  return [...new Set(blockers)];
}

export function buildCardIdentityOnnxManifest({
  sourceRun,
  checkpoint,
  generatedAt = new Date().toISOString(),
  testImageCount = 0,
  calibrationImageCount = 0,
}: {
  sourceRun: EmbeddingSourceRun | null;
  checkpoint: EmbeddingCheckpointManifest | null;
  generatedAt?: string;
  testImageCount?: number;
  calibrationImageCount?: number;
}): CardIdentityOnnxManifest {
  const blockers = getCardIdentityOnnxExportBlockers({
    sourceRun,
    checkpoint,
    testImageCount,
    calibrationImageCount,
  });

  return {
    schemaVersion: CARD_IDENTITY_ONNX_EXPORT_SCHEMA_VERSION,
    modelVersion: CARD_IDENTITY_ONNX_MODEL_VERSION,
    status: blockers.length ? 'blocked' : 'exported',
    generatedAt,
    immutableVersion: true,
    approvedForMobileInference: false,
    blockers,
    sourceModel: {
      modelVersion: checkpoint?.modelVersion ?? sourceRun?.config?.modelVersion ?? null,
      status: checkpoint?.status ?? sourceRun?.status ?? null,
      selectedBaseline: sourceRun?.selectedBaseline ?? null,
      checkpointContainsWeights: Boolean(checkpoint?.containsWeights),
      datasetManifestSha256: checkpoint?.datasetManifestSha256 ?? sourceRun?.datasetManifestSha256 ?? null,
      datasetVersion: sourceRun?.datasetVersion ?? null,
      sourceCommitHash: checkpoint?.sourceCommitHash ?? sourceRun?.sourceCommitHash ?? null,
    },
    preprocessing: createCardIdentityPreprocessingSpec(),
    validation: {
      requiredTestImages: 1000,
      testedImages: testImageCount,
      pytorchOutputAvailable: false,
      onnxOutputAvailable: false,
      maximumEmbeddingDifference: null,
      meanEmbeddingDifference: null,
      nearestNeighbourParity: null,
    },
    quantization: {
      fullPrecision: {
        status: 'blocked',
        file: 'model.onnx',
        sha256: null,
        retrievalAccuracy: null,
        hardNegativeAccuracy: null,
        exactVariantAccuracy: null,
      },
      fp16: {
        status: 'blocked',
        file: null,
        sha256: null,
        retrievalAccuracy: null,
        hardNegativeAccuracy: null,
        exactVariantAccuracy: null,
      },
      int8: {
        status: 'blocked',
        file: null,
        sha256: null,
        representativeCalibrationImages: calibrationImageCount,
        retrievalAccuracy: null,
        hardNegativeAccuracy: null,
        exactVariantAccuracy: null,
        rejectionReason: 'INT8 cannot be accepted or rejected until a representative calibration set and protected hard-negative evaluation are available.',
      },
    },
    benchmark: {
      modelLoadTimeMs: null,
      warmInferenceMs: null,
      coldInferenceMs: null,
      memoryUseBytes: null,
      outputParity: null,
      modelFileSizeBytes: null,
    },
    files: {
      fullPrecisionModel: {
        path: 'assets/models/card_identity/model.onnx',
        exists: false,
        sha256: null,
      },
      modelManifest: {
        path: 'assets/models/card_identity/model-manifest.json',
      },
      modelCard: {
        path: 'assets/models/card_identity/MODEL_CARD.md',
      },
    },
    license: {
      modelWeights: 'none_released',
      notes: 'No model binary was exported for this blocked run. Future weights require approved training provenance and an explicit model licence.',
    },
  };
}
