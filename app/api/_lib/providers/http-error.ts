/** Erreur HTTP levée par un provider — porte le status pour que la chaîne (chain.ts) puisse reconnaître un 429 sans parser le message. */
export class ProviderHttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = "ProviderHttpError";
  }
}

export function isQuotaError(error: unknown): boolean {
  return error instanceof ProviderHttpError && error.status === 429;
}
