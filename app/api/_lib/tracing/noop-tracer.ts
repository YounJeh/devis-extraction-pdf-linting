import type { GenerationHandle, TraceHandle, Tracer } from "./types.js";

const noOpHandle: TraceHandle = {
  setInput() {},
  setOutput() {},
  setMetadata() {},
  setError() {},
};

const noOpGenerationHandle: GenerationHandle = {
  ...noOpHandle,
  setModel() {},
  setUsage() {},
};

/** Tracer par défaut : aucune clé Langfuse en environnement. */
export const noOpTracer: Tracer = {
  async traceRequest(fn) {
    return fn(noOpHandle);
  },
  async traceOcr(fn) {
    return fn(noOpHandle);
  },
  async traceExtraction(fn) {
    return fn(noOpGenerationHandle);
  },
  async flush() {},
};
