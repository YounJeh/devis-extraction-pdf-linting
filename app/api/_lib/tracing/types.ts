export interface TraceHandle {
  setInput(input: unknown): void;
  setOutput(output: unknown): void;
  setMetadata(metadata: Record<string, unknown>): void;
  setError(message: string): void;
}

/** Noms de clés imposés par Langfuse pour usageDetails (input/output/total, pas promptTokens/completionTokens). */
export interface GenerationUsage {
  input?: number;
  output?: number;
  total?: number;
}

export interface GenerationHandle extends TraceHandle {
  setModel(model: string): void;
  setUsage(usage: GenerationUsage): void;
}

/**
 * Une trace par appel à /api/extract : traceRequest (racine) contient
 * traceOcr (span) puis traceExtraction (generation) — même structure que
 * app/tools/tracer.py côté pipeline Python (trace_run / pdf_extraction /
 * ner_extraction).
 */
export interface Tracer {
  traceRequest<T>(fn: (handle: TraceHandle) => Promise<T>): Promise<T>;
  traceOcr<T>(params: { provider: string }, fn: (handle: TraceHandle) => Promise<T>): Promise<T>;
  traceExtraction<T>(
    params: { provider: string; reason: string },
    fn: (handle: GenerationHandle) => Promise<T>,
  ): Promise<T>;
  /** Force l'envoi des traces en attente — nécessaire en serverless (process tué juste après la réponse). */
  flush(): Promise<void>;
}
