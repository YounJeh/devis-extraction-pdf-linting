# Choix techniques

Décisions techniques hors périmètre des specs : arbitrages, contournements,
compromis. Format : contexte → décision → alternatives écartées.

---

## Champs et prompt d'extraction pilotés par un config JSON

**Contexte :** les champs à extraire (`api/_lib/fields.ts`) et le prompt
système (`EXTRACTION_SYSTEM_PROMPT`, règles écrites à la main par champ)
étaient codés en dur, dupliqués côté frontend (`DEMO_FIELDS`). Un
développeur ne pouvait pas adapter l'app à un autre document/cas d'usage
sans modifier le code TypeScript.

**Décision** (`app/config/`) : source unique `fields.config.json`
(`documentContext` + `fields[]` avec `id`/`label`/`instructions`/`example`
optionnels), importée telle quelle par le frontend (Vite) et le backend
(fonction Vercel) — pas d'écriture disque à l'exécution, compatible
serverless. Le prompt système est assemblé dynamiquement
(`buildExtractionSystemPrompt`) : règles de protocole fixes dans le code +
`documentContext` + une règle par champ générée depuis `instructions`. Un
éditeur de champs en front (`src/field-editor.ts`) permet
d'ajouter/éditer/supprimer des champs et d'exporter/importer ce JSON, et
d'envoyer un override ponctuel à `/api/extract` (non stocké) pour tester
sans redéployer.

**Écarté :** stockage du config en base/KV (inutile pour un déploiement
mono-instance, un fichier versionné suffit) · presets multiples
sélectionnables dans une même instance (hors scope — un déploiement = un
cas d'usage) · prompt système 100 % libre par champ (perd la cohérence
apportée par des règles de protocole fixes, partagées par tous les champs).

**Correctif (bug trouvé par l'utilisateur en preview) :** `import fieldsConfigJson from
"../../config/fields.config.json"` sans attribut faisait planter la fonction
serverless au chargement du module (`ERR_IMPORT_ATTRIBUTE_MISSING`, runtime
Node ESM de Vercel), renvoyant une page d'erreur Vercel non-JSON — d'où
« Réponse du serveur illisible (500) » côté client, l'erreur ne remontant
jamais jusqu'au try/catch de `api/extract.ts`. Invisible en local
(`vercel dev` ne reproduit pas ce comportement du runtime Node ESM déployé).
Corrigé en ajoutant `with { type: "json" }` à cet import (`api/_lib/config.ts`
uniquement — l'import JSON côté frontend, géré par Vite, n'a pas besoin de cet
attribut).

---

## Tracing Langfuse optionnel (OpenTelemetry manuel, pas NodeSDK)

**Contexte :** besoin de tracer les appels modèles (OCR + extraction) une
fois l'app déployée sur Vercel — logs Vercel éphémères, pas d'historique
exploitable. Optionnel, désactivé par défaut, pour qu'un développeur qui
reprend le projet n'ait pas à configurer Langfuse.

**Décision** (`app/api/_lib/tracing/`) : pattern `Tracer`/`NoOpTracer`/factory
(`getTracer()`), bascule vers `LangfuseTracer` uniquement si
`LANGFUSE_PUBLIC_KEY`/`LANGFUSE_SECRET_KEY` sont en env (import dynamique,
SDK jamais chargé sinon). SDK JS `@langfuse/tracing` + `@langfuse/otel`
(génération OpenTelemetry-native) plutôt que `@opentelemetry/sdk-node`
(`NodeSDK`) complet : ce dernier embarque de l'auto-instrumentation non
désirée pour une instrumentation entièrement manuelle. `LangfuseSpanProcessor`
en `exportMode: "immediate"` (recommandé par Langfuse pour le serverless —
chaque span est envoyé dès sa fin, pas de batch qui pourrait être perdu si
l'instance Vercel est gelée entre deux requêtes). Une trace par requête
`/api/extract` (`extract_request`), span `ocr` + génération `extraction`
imbriqués dedans — modèle, tokens, provider effectivement choisi (et raison
de la bascule "gros document"), prompt et résultat complets, erreurs
marquées à chaque niveau.

**Bugs trouvés en testant contre un vrai projet Langfuse Cloud (PDF
synthétique) :**
- sans `ContextManager` OpenTelemetry enregistré, `startActiveObservation`
  n'a aucune notion de span actif à travers les `await` : chaque appel
  démarrait sa propre trace au lieu de s'imbriquer sous `extract_request`
  (symptôme : un `traceId` différent par observation). C'est justement ce
  que `NodeSDK.start()` fait automatiquement — en s'en passant, il faut
  l'enregistrer soi-même : `AsyncLocalStorageContextManager`
  (`@opentelemetry/context-async-hooks`).
- `usageDetails` attend les clés génériques `input`/`output`/`total`, pas
  `promptTokens`/`completionTokens`/`totalTokens` (le type TS `OpenAiUsage`
  exposé par le SDK est trompeur — ce n'est pas la convention lue pour ce
  champ) : sans ça, Langfuse ne peut pas calculer le coût.

**Écarté :** `@opentelemetry/sdk-node` (`NodeSDK`) complet — plus simple sur
le papier mais auto-instrumente au-delà de nos deux étapes tracées · flag
d'activation séparé (`LANGFUSE_TRACING_ENABLED=...`) — la présence des clés
suffit, décision explicite (moins de config pour qui reprend le projet) ·
calcul de coût manuel par provider — Langfuse le calcule automatiquement à
partir de `model` + `usageDetails` quand le modèle est dans son référentiel
de prix (`null` pour Groq, modèle OSS auto-hébergé hors de ce référentiel —
comportement attendu, pas un bug).

---

## Chaîne de fournisseurs OCR/extraction avec bascule automatique sur quota gratuit

**Contexte :** un seul provider par tâche (`OCR_PROVIDER`/
`EXTRACTION_PROVIDER`) + un unique fallback fixe (`LARGE_DOC_EXTRACTION_PROVIDER`,
toujours vers Gemini) quand le texte dépassait le TPM de Groq. Ne couvrait
ni les nouveaux fournisseurs (OpenRouter, Cloudflare Workers AI, Z.ai) ni
le cas générique "quota gratuit dépassé, réessayer ailleurs".

**Décision** (`app/config/providers.config.json` + `api/_lib/providers/chain.ts`) :
config déclarative par provider (clé API en env var, modèle OCR/extraction
si dispo, quota gratuit indicatif sourcé, seuil de contexte optionnel) +
deux ordres d'essai (`ocrOrder`/`extractionOrder`). `runChain` essaie
chaque provider dans l'ordre, bascule au suivant uniquement sur 429
(`ProviderHttpError`) ou — extraction seulement — si le texte dépasse le
`contextCharThreshold` du provider (généralise l'ancien fallback fixe,
qui disparaît). Toute autre erreur (clé invalide, bug) propage
immédiatement plutôt que d'être masquée par un faux "un autre a pris le
relais". `OCR_PROVIDER`/`EXTRACTION_PROVIDER` restent un override manuel
qui bypass entièrement la chaîne (debug). Cloudflare Workers AI ne
déclare que l'extraction : son seul modèle vision accepte une image, pas
un PDF multi-page.

**Écarté :** comptage persistant des appels/jour/mois (demanderait une
base/KV, aucune dans le projet — réactif sur l'erreur réelle du provider
suffit) · UI de saisie des clés API (env vars, cohérent avec le
mono-déploiement déjà acté) · throttling actif du débit (usage mono-PDF
à la fois, risque de dépassement faible) · rasterisation PDF→image pour
permettre l'OCR Cloudflare (nouvelle dépendance non triviale en
serverless, pour un gain incertain).
