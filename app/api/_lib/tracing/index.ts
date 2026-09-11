import type { Tracer } from "./types.js";
import { noOpTracer } from "./noop-tracer.js";

let tracerPromise: Promise<Tracer> | undefined;

/**
 * NoOpTracer si LANGFUSE_PUBLIC_KEY/LANGFUSE_SECRET_KEY sont absentes —
 * aucune ligne de code Langfuse/OpenTelemetry n'est alors exécutée (import
 * dynamique, jamais déclenché). Sinon LangfuseTracer, mis en cache pour
 * toute la durée de vie de l'instance de fonction serverless.
 */
export function getTracer(): Promise<Tracer> {
  if (!tracerPromise) {
    tracerPromise = resolveTracer();
  }
  return tracerPromise;
}

async function resolveTracer(): Promise<Tracer> {
  if (!process.env.LANGFUSE_PUBLIC_KEY || !process.env.LANGFUSE_SECRET_KEY) {
    return noOpTracer;
  }
  const { langfuseTracer } = await import("./langfuse-tracer.js");
  return langfuseTracer;
}
