import { context } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { LangfuseSpanProcessor } from "@langfuse/otel";
import {
  setLangfuseTracerProvider,
  startActiveObservation,
  type LangfuseGeneration,
  type LangfuseSpan,
} from "@langfuse/tracing";
import type { GenerationHandle, TraceHandle, Tracer } from "./types.js";

// exportMode "immediate" : recommandé par Langfuse pour les environnements
// serverless (chaque span est envoyé dès sa fin, pas de batch en arrière-
// plan qui pourrait être perdu si le process Vercel est gelé/tué entre deux
// requêtes). Exécuté une seule fois par instance de fonction serverless
// (import dynamique mis en cache par Node après le premier appel).
const spanProcessor = new LangfuseSpanProcessor({ exportMode: "immediate" });
setLangfuseTracerProvider(new NodeTracerProvider({ spanProcessors: [spanProcessor] }));

// Sans context manager enregistré, OpenTelemetry n'a aucune notion de "span
// actif" à travers les await : chaque startActiveObservation démarrerait sa
// propre trace au lieu de s'imbriquer sous traceRequest. NodeSDK
// (@opentelemetry/sdk-node) le ferait automatiquement, mais embarque aussi
// de l'auto-instrumentation non désirée ici — AsyncLocalStorageContextManager
// suffit pour notre instrumentation manuelle.
const contextManager = new AsyncLocalStorageContextManager();
contextManager.enable();
context.setGlobalContextManager(contextManager);

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function makeSpanHandle(span: LangfuseSpan): TraceHandle {
  return {
    setInput: (input) => span.update({ input }),
    setOutput: (output) => span.update({ output }),
    setMetadata: (metadata) => span.update({ metadata }),
    setError: (message) => span.update({ level: "ERROR", statusMessage: message }),
  };
}

function makeGenerationHandle(generation: LangfuseGeneration): GenerationHandle {
  return {
    setInput: (input) => generation.update({ input }),
    setOutput: (output) => generation.update({ output }),
    setMetadata: (metadata) => generation.update({ metadata }),
    setError: (message) => generation.update({ level: "ERROR", statusMessage: message }),
    setModel: (model) => generation.update({ model }),
    setUsage: (usage) => generation.update({ usageDetails: usage as Record<string, number> }),
  };
}

export const langfuseTracer: Tracer = {
  async traceRequest(fn) {
    return startActiveObservation("extract_request", async (span) => {
      const handle = makeSpanHandle(span);
      try {
        return await fn(handle);
      } catch (error) {
        handle.setError(errorMessage(error));
        throw error;
      }
    });
  },

  async traceOcr({ provider }, fn) {
    return startActiveObservation("ocr", async (span) => {
      span.update({ metadata: { provider } });
      const handle = makeSpanHandle(span);
      try {
        return await fn(handle);
      } catch (error) {
        handle.setError(errorMessage(error));
        throw error;
      }
    });
  },

  async traceExtraction({ provider, reason }, fn) {
    return startActiveObservation(
      "extraction",
      async (generation) => {
        generation.update({ metadata: { provider, reason } });
        const handle = makeGenerationHandle(generation);
        try {
          return await fn(handle);
        } catch (error) {
          handle.setError(errorMessage(error));
          throw error;
        }
      },
      { asType: "generation" },
    );
  },

  async flush() {
    await spanProcessor.forceFlush();
  },
};
