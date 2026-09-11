# Implementation Plan : chaîne de fournisseurs OCR/extraction avec bascule automatique

Intent confirmée : [docs/intent/multi-provider-fallback.md](../docs/intent/multi-provider-fallback.md)

## Overview

Finir d'implémenter les fournisseurs OCR/extraction actuellement stubs
(Cloudflare Workers AI, Z.ai, OpenRouter, + OCR Gemini — voir constat
ci-dessous), déclarer leurs modèles et quotas gratuits dans un nouveau
`app/config/providers.config.json`, puis remplacer la sélection actuelle
"un seul provider + un fallback fixe gros document" par une chaîne ordonnée
générique par tâche (OCR / extraction) qui bascule au provider suivant sur
erreur de quota (429) ou, pour l'extraction seulement, sur contexte trop
grand.

**Constat fait pendant la lecture du code (ajuste le périmètre annoncé
pendant l'interview)** : seuls Mistral (OCR), Groq (extraction) et Gemini
(extraction) sont réellement implémentés aujourd'hui. `OCR Gemini` est
*aussi* un stub (`app/api/_lib/providers/ocr/gemini.ts`), pas seulement
Cloudflare/Z.ai/OpenRouter. Il est ajouté aux tâches ci-dessous.

## Architecture Decisions

- **Clés API** : variables d'environnement, même pattern que
  `MISTRAL_API_KEY`/`GEMINI_API_KEY`/`GROQ_API_KEY`. Nouvelles :
  `OPENROUTER_API_KEY`, `ZAI_API_KEY`, `CLOUDFLARE_API_TOKEN` +
  `CLOUDFLARE_ACCOUNT_ID` (Workers AI a besoin des deux, pas d'une seule clé).
- **Config des providers** (`app/config/providers.config.json`, même esprit
  que `fields.config.json`) : un objet par provider avec, selon capacité
  disponible, `ocr: { model, freeQuota }` et/ou `extraction: { model,
  freeQuota }`, plus `ocrOrder`/`extractionOrder` (tableaux de noms de
  provider = ordre d'essai). Validé par un petit schema TS comme
  `config/schema.ts` le fait déjà pour les champs.
- **Chaîne de bascule** : réactive uniquement (pas de comptage persistant).
  Un nouveau module (`app/api/_lib/providers/chain.ts` ou équivalent)
  généralise `pickExtractionProvider`/`getOcrProvider` : essaie les
  providers de `ocrOrder`/`extractionOrder` dans l'ordre, passe au suivant
  si (a) le provider répond une erreur de quota/429, ou (b) — extraction
  seulement — le texte dépasse le seuil de contexte configuré pour ce
  provider.
- **`LARGE_DOC_EXTRACTION_PROVIDER` devient redondant** : le seuil
  "contexte trop grand → bascule" devient une propriété générique de
  chaque provider d'extraction dans le config JSON (`contextCharThreshold`
  ou équivalent), appliquée par la chaîne à *tous* les providers dans
  l'ordre — pas seulement un fallback fixe unique vers Gemini. Voir "Open
  Questions" : confirmer la suppression de cette variable avant de coder.
- **`OCR_PROVIDER`/`EXTRACTION_PROVIDER`** : conservées comme override
  manuel — si définie, force ce provider unique (comportement actuel,
  bypass la chaîne). Sinon, la chaîne s'applique.
- **Débit max** : champ informatif dans le config (`rpm`), non appliqué en
  code (pas de throttling).
- **Détection "quota dépassé"** : chaque provider peut avoir un format
  d'erreur différent (HTTP 429 pour la plupart ; à vérifier pour Cloudflare/
  Z.ai). Le module chain doit reconnaître au minimum le statut HTTP 429, et
  chaque provider peut exposer un flag `isQuotaError` optionnel sur ses
  erreurs pour les cas non-standards.
- **Tracing (Langfuse)** : la trace `extraction`/`ocr` doit continuer à
  enregistrer le provider effectivement utilisé et la raison de la bascule
  (aujourd'hui limité à `"default" | "large_doc_threshold"` — à étendre pour
  couvrir `"quota_exceeded"` et lister les providers sautés).

## Provider Matrix (recherche effectuée pendant le planning, 2026-09)

Chiffres issus de la documentation officielle quand disponible, sinon
d'agrégateurs tiers (signalé) — **à vérifier dans la console de chaque
fournisseur avant de figer les valeurs dans le config**, ces grilles
changent souvent et plusieurs fournisseurs ne publient pas de chiffres
précis.

| Provider | Capacité | Modèle proposé | Quota gratuit (approx.) | Source |
|---|---|---|---|---|
| Mistral | OCR ✅ (déjà implémenté) | `mistral-ocr-latest` | Non publié précisément ("Experiment tier", ~1G tokens/mois tous modèles confondus) | [docs.mistral.ai/deployment/laplateforme/tier](https://docs.mistral.ai/deployment/laplateforme/tier) |
| Groq | Extraction ✅ (déjà implémenté) | `openai/gpt-oss-120b` | 30 RPM / 1 000 RPD / 8 000 TPM | [console.groq.com/docs/rate-limits](https://console.groq.com/docs/rate-limits) (officiel) |
| Gemini | Extraction ✅ (déjà implémenté), OCR à implémenter | `gemini-3.1-flash-lite` | ~15 RPM / ~1 000-1 500 RPD / ~250k TPM (agrégateurs, page officielle ne détaille pas les chiffres par tier) | [ai.google.dev/gemini-api/docs/rate-limits](https://ai.google.dev/gemini-api/docs/rate-limits) + agrégateurs (tokenmix.ai, aipromptshub.co) |
| OpenRouter | OCR + extraction à implémenter | Modèle `:free` à confirmer au moment de coder (liste change souvent) | 20 RPM ; 50 RPD sans crédit acheté, 1 000 RPD si ≥ 10 $ de crédit historique | [openrouter.ai/docs/api-reference/limits](https://openrouter.ai/docs/api-reference/limits) (officiel) |
| Cloudflare Workers AI | Extraction à implémenter. **OCR écarté** — voir note | Extraction : `@cf/meta/llama-3.3-70b-instruct-fp8-fast` | 10 000 Neurons/jour, **pool partagé entre OCR et extraction si les deux étaient utilisées** (pas un quota séparé par tâche) | [developers.cloudflare.com/workers-ai/platform/pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) (officiel) |
| Z.ai | OCR + extraction à implémenter | OCR : `glm-4.6v-flash` (vision, gratuit) · Extraction : `glm-4.7-flash` ou `glm-4.5-flash` (gratuit) | Gratuit mais limites non publiées publiquement ; une source tierce rapporte 1 requête concurrente pour `glm-4.6v-flash` — à vérifier au moment de créer la clé | [docs.z.ai/guides/overview/pricing](https://docs.z.ai/guides/overview/pricing) (officiel, sans détail RPM/RPD) |

**Note (découverte en implémentant Task 5)** : le seul modèle vision de
Cloudflare Workers AI (`@cf/meta/llama-3.2-11b-vision-instruct`) n'accepte
qu'une image, pas un PDF multi-page — contrairement à
Mistral/Gemini/OpenRouter qui acceptent le PDF directement. Rasteriser
chaque page côté serveur aurait demandé une nouvelle dépendance de rendu
PDF→image (ex. `pdfjs-dist` + un backend canvas natif), non prévue au
plan et fragile en fonction serverless. **Décision validée avec
l'utilisateur : Cloudflare Workers AI ne déclare que la capacité
extraction**, cohérent avec le "si possible" de la demande initiale.

**Ordre d'essai** (confirmé par l'utilisateur, ajusté après le retrait de
l'OCR Cloudflare) :
- OCR : `mistral` → `gemini` → `openrouter` → `zai`
- Extraction : `groq` → `gemini` → `openrouter` → `cloudflare-workers-ai` → `zai`

Logique : les deux providers déjà éprouvés et implémentés restent en tête ;
ensuite on ordonne par quota gratuit le plus généreux/prévisible en premier.
Cloudflare est placé après OpenRouter/Z.ai côté extraction car son pool de
neurones est partagé avec l'OCR (l'utiliser aussi en dernier recours pour
l'extraction réduit le risque de l'épuiser sur une seule tâche).

## Task List

### Phase 1 : Fondations (config + clés)

- [ ] **Task 1** — `.env.example` : ajouter `OPENROUTER_API_KEY`,
      `ZAI_API_KEY`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` avec
      commentaires (lien console de chaque fournisseur). **Livré en
      premier et isolément** pour que l'utilisateur puisse commencer à
      renseigner ses clés pendant que le reste avance.
- [ ] **Task 2** — `app/config/providers.config.json` + schema/validation
      TS (`app/config/providers.schema.ts` ou ajout à `schema.ts`) :
      structure décrite ci-dessus, remplie avec la Provider Matrix
      (quotas + modèles), `ocrOrder`/`extractionOrder`.

### Checkpoint : Fondations
- [ ] `providers.config.json` valide contre son schema (test unitaire ou
      script de validation au build)
- [ ] `.env.example` à jour, partagé à l'utilisateur pour qu'il commence à
      renseigner les vraies clés (Cloudflare, Z.ai, OpenRouter)

### Phase 2 : Providers OCR manquants

- [ ] **Task 3** — OCR Gemini (`app/api/_lib/providers/ocr/gemini.ts`) :
      appel `generateContent` avec le PDF en `inlineData`, mapping vers
      `OcrResult` (pas de bounding boxes détaillées disponibles comme chez
      Mistral — à documenter si `items` reste vide).
- [ ] **Task 4** — OCR OpenRouter (`.../ocr/openrouter.ts`) : modèle vision
      `:free` confirmé au moment de coder (vérifier via
      `GET https://openrouter.ai/api/v1/models`).
- [x] ~~Task 5 — OCR Cloudflare Workers AI~~ **annulée** : le modèle vision
      disponible n'accepte qu'une image, pas un PDF multi-page (voir note
      Provider Matrix ci-dessus). Cloudflare Workers AI ne déclare que la
      capacité extraction.
- [ ] **Task 6** — OCR Z.ai (`.../ocr/zai.ts`) : `glm-4.6v-flash`.

### Checkpoint : OCR
- [ ] Chaque nouveau provider testable individuellement via
      `OCR_PROVIDER=<nom>` (override manuel existant) sur un vrai PDF —
      **bloqué sur les clés réelles pour openrouter/zai**, voir Open
      Questions / point de blocage.
- [ ] `npm run build` (ou équivalent TS) passe.

### Phase 3 : Providers extraction manquants

- [ ] **Task 7** — Extraction OpenRouter (`.../extraction/openrouter.ts`) :
      modèle texte `:free` confirmé au moment de coder.
- [ ] **Task 8** — Extraction Cloudflare Workers AI
      (`.../extraction/cloudflare-workers-ai.ts`).
- [ ] **Task 9** — Extraction Z.ai (`.../extraction/zai.ts`) :
      `glm-4.7-flash` (ou `glm-4.5-flash`).

### Checkpoint : Extraction
- [ ] Chaque nouveau provider testable via `EXTRACTION_PROVIDER=<nom>`.
- [ ] `npm run build` passe.

### Phase 4 : Chaîne de bascule générique

- [x] **Task 10** — Module de résolution de chaîne (logique pure) : étant
      donné un ordre de providers + une fonction d'appel, essaie chacun
      dans l'ordre, saute au suivant sur erreur de quota (429, via
      `ProviderHttpError`) ou (extraction seulement) contexte trop grand.
      Toute autre erreur propage immédiatement (pas de bascule silencieuse
      sur un vrai bug/clé invalide).
- [x] **Task 11** — Branchée dans `app/api/extract.ts` via
      `runOcr()`/`runExtraction()` (`ocr/index.ts`, `extraction/index.ts`),
      qui remplacent `getOcrProvider`/`getExtractionProvider`/
      `getLargeDocExtractionProvider`/`pickExtractionProvider`. Override
      manuel `OCR_PROVIDER`/`EXTRACTION_PROVIDER` conservé. Tracing étendu :
      `traceOcr`/`traceExtraction` ne prennent plus le provider en
      paramètre (connu seulement après résolution de la chaîne) —
      `handle.setMetadata({ provider, attempts })` posé dans le callback.
- [x] **Task 12** — `LARGE_DOC_EXTRACTION_PROVIDER` retiré (env var +
      code), remplacé par `contextCharThreshold` générique par provider
      dans `providers.config.json` (confirmé par l'utilisateur).

### Checkpoint : Chaîne complète
- [x] Simuler un 429 sur le premier provider OCR (mock de `fetch`) →
      bascule confirmée vers le suivant, historique correct dans `attempts`.
- [x] Simuler un contexte trop grand pour l'extraction → bascule confirmée.
- [ ] Test end-to-end avec un vrai PDF, au moins un provider par tâche
      utilisant une vraie clé pour chaque nouveau fournisseur — **bloqué
      pour OpenRouter/Z.ai** (clés pas encore renseignées ; code écrit et
      buildé). Cloudflare Workers AI n'a que l'extraction (OCR écarté).
- [x] `npm run build` passe.

### Phase 5 : Documentation

- [ ] **Task 13** — `choix_techniques.md` : entrée brève et synthétique
      (contexte → décision → alternatives écartées) sur le passage à une
      chaîne de fournisseurs avec bascule automatique — cœur de
      l'application, donc dans le périmètre de ce fichier par consigne du
      projet.

### Checkpoint final
- [ ] Tous les critères d'acceptation des tâches ci-dessus sont cochés.
- [ ] `choix_techniques.md` à jour.
- [ ] Prêt pour `/code-review-and-quality` puis proposition de PR (par
      consigne du projet, une fois la branche de feature entièrement
      implémentée).

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Quotas gratuits réels différents de ceux documentés (agrégateurs tiers, chiffres non officiels pour Mistral/Z.ai) | Moyen — l'ordre d'essai ou les seuils de contexte peuvent être sous-optimaux au lancement | Champ `freeQuota` versionné avec source/date, facile à corriger sans toucher au code ; le comportement réactif (bascule sur 429 réel) reste correct même si les chiffres indicatifs sont approximatifs |
| Modèles gratuits `:free` d'OpenRouter renommés/retirés entre le planning et l'implémentation | Moyen | Vérifier via l'API `/models` d'OpenRouter au moment de coder Task 4/Task 7, pas seulement se fier à ce plan |
| Détection de "quota dépassé" non uniforme entre fournisseurs (Cloudflare/Z.ai peuvent ne pas renvoyer un 429 classique) | Moyen — la bascule pourrait ne pas se déclencher pour ces providers | Vérifier le comportement réel en erreur pendant l'implémentation de chaque provider (Task 3-9), documenter dans le code si un format différent |
| Suppression de `LARGE_DOC_EXTRACTION_PROVIDER` change un comportement de prod existant | Faible-Moyen | Confirmer explicitement avec l'utilisateur avant Task 12 (voir Open Questions) ; le nouveau mécanisme est strictement plus général (couvre le même cas + plus) |
| Pas de tests automatisés visibles dans le repo pour les providers existants | Faible | Rester cohérent avec le style actuel (pas de suite de tests dédiée) sauf si l'utilisateur en demande pendant `/code-review-and-quality` |

## Open Questions

1. ~~Confirmer la suppression de `LARGE_DOC_EXTRACTION_PROVIDER`~~ —
   **confirmé : oui**, retrait au profit du seuil de contexte générique par
   provider (Task 12).
2. ~~Ordre d'essai proposé~~ — **confirmé**, tel quel dans la Provider
   Matrix ci-dessus.
3. Les modèles exacts pour OpenRouter (Task 4, Task 7) seront confirmés au
   moment de coder (liste des modèles `:free` change souvent) plutôt que
   figés maintenant — attendu, pas bloquant pour démarrer Phase 1.
