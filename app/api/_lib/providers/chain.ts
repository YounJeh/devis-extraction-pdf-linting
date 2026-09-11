import { isQuotaError } from "./http-error.js";

export interface ChainAttempt {
  provider: string;
  outcome: "success" | "skipped_quota" | "skipped_context" | "failed";
  detail?: string;
}

export interface ChainResult<T> {
  value: T;
  provider: string;
  attempts: ChainAttempt[];
}

/** Porte l'historique des tentatives, que la chaîne se soit épuisée (quota partout) ou qu'un provider ait échoué pour une autre raison. */
export class ChainError extends Error {
  constructor(
    message: string,
    public readonly attempts: ChainAttempt[],
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "ChainError";
  }
}

/**
 * Essaie chaque provider de `order` dans l'ordre. Bascule au suivant
 * uniquement sur erreur de quota (429, cf. isQuotaError) ou si
 * `contextTooLarge` signale ce provider avant même de l'appeler — toute
 * autre erreur (clé invalide, bug, panne) est propagée immédiatement :
 * on ne veut pas masquer une vraie panne derrière un faux air de succès
 * "un autre provider a pris le relais".
 */
export async function runChain<T>(
  order: readonly string[],
  options: {
    contextTooLarge?: (provider: string) => boolean;
    call: (provider: string) => Promise<T>;
  },
): Promise<ChainResult<T>> {
  const attempts: ChainAttempt[] = [];

  for (const provider of order) {
    if (options.contextTooLarge?.(provider)) {
      attempts.push({ provider, outcome: "skipped_context" });
      continue;
    }

    try {
      const value = await options.call(provider);
      attempts.push({ provider, outcome: "success" });
      return { value, provider, attempts };
    } catch (error) {
      const detail = errorMessage(error);
      if (isQuotaError(error)) {
        attempts.push({ provider, outcome: "skipped_quota", detail });
        continue;
      }
      attempts.push({ provider, outcome: "failed", detail });
      throw new ChainError(`${provider} a échoué : ${detail}`, attempts, error);
    }
  }

  throw new ChainError(
    `Tous les providers ont épuisé leur quota gratuit : ${order.join(", ")}`,
    attempts,
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
