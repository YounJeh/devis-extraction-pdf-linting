# Todo : chaîne de fournisseurs OCR/extraction avec bascule automatique

Plan complet : [tasks/plan.md](plan.md). Intent confirmée :
[docs/intent/multi-provider-fallback.md](../docs/intent/multi-provider-fallback.md).

## Phase 1 : Fondations

### Task 1 : `.env.example` — nouvelles clés
**Description :** Ajouter les variables d'environnement pour les 3 nouveaux
fournisseurs, avec commentaires (lien console). Livré isolément en premier
pour que l'utilisateur puisse commencer à renseigner ses clés.

**Acceptance criteria :**
- [x] `OPENROUTER_API_KEY`, `ZAI_API_KEY`, `CLOUDFLARE_API_TOKEN`,
      `CLOUDFLARE_ACCOUNT_ID` présentes dans `app/.env.example` avec un
      commentaire (lien vers la console du fournisseur), même style que
      les clés existantes.
- [x] `app/.env` (local, non versionné) reçoit les mêmes clés vides — pour
      que l'utilisateur les remplisse au même endroit qu'aujourd'hui.

**Verification :**
- [x] Relecture visuelle du diff (pas de build/test dédié pour un fichier
      d'env)

**Dependencies :** None

**Files likely touched :**
- `app/.env.example`
- `app/.env`

**Estimated scope :** XS (1 fichier, +local .env)

---

### Task 2 : `app/config/providers.config.json` + validation
**Description :** Nouveau fichier de config déclarant, par provider, les
modèles OCR/extraction disponibles, les quotas gratuits (indicatifs), et
les deux ordres d'essai. Suivre le pattern `fields.config.json` +
`config/schema.ts` (validation à l'import, erreurs explicites).

**Acceptance criteria :**
- [x] `providers.config.json` contient une entrée par provider (mistral,
      groq, gemini, openrouter, cloudflare-workers-ai, zai) avec
      `apiKeyEnv` (+ `accountIdEnv` pour Cloudflare), et selon capacité
      `ocr: { model, freeQuota }` / `extraction: { model, freeQuota,
      contextCharThreshold? }`.
- [x] `ocrOrder` et `extractionOrder` (tableaux de noms de provider)
      présents et cohérents avec les providers déclarés.
- [x] Une fonction de validation (type `validateProvidersConfig`, dans
      l'esprit de `validateExtractionConfig`) rejette une config
      incohérente (provider dans l'ordre mais non déclaré, `apiKeyEnv`
      manquant, etc.) avec un message clair.
- [x] Import côté serverless utilise `with { type: "json" }` (cf. bug
      documenté dans `choix_techniques.md` sur `fields.config.json`).

**Verification :**
- [x] `npm run build` (ou `tsc --noEmit`) passe
- [x] Test manuel (script tsx jetable, supprimé après usage) : config
      réelle valide + 5 cas cassés (apiKeyEnv manquant, provider sans
      capacité, ordre référençant un provider inconnu ou une capacité non
      déclarée, ordre vide) → toutes les erreurs de validation attendues
      sont levées avec un message clair

**Dependencies :** Task 1 (les noms de clés doivent correspondre)

**Files likely touched :**
- `app/config/providers.config.json`
- `app/config/schema.ts` (ou nouveau `providers.schema.ts`)
- `app/api/_lib/config.ts`

**Estimated scope :** S

---

## Checkpoint : Fondations
- [x] `providers.config.json` valide contre son schema
- [x] `.env.example` à jour — **signaler à l'utilisateur que c'est prêt
      pour qu'il renseigne les vraies clés Cloudflare/Z.ai/OpenRouter**
- [ ] Revue avec l'utilisateur avant de continuer

## Phase 2 : Providers OCR manquants

### Task 3 : OCR Gemini
**Description :** Implémenter `ocr/gemini.ts` (actuellement stub) avec
`generateContent`, PDF envoyé en `inlineData` (base64), mapping de la
réponse vers `OcrResult`.

**Acceptance criteria :**
- [x] `geminiOcrProvider.run()` retourne un `OcrResult` avec au moins
      `pages[].text` rempli à partir d'un vrai PDF (`items` peut rester
      vide si Gemini ne renvoie pas de bounding boxes — à documenter dans
      un commentaire si c'est le cas).
- [x] Erreur claire si `GEMINI_API_KEY` absente (cohérent avec les autres
      providers).
- [x] Modèle utilisé = celui déclaré dans `providers.config.json` pour
      `gemini.ocr.model` (pas une constante dupliquée).

**Verification :**
- [x] Testé directement (script jetable hors repo) avec une vraie clé sur
      un PDF de test à 2 pages → texte transcrit fidèlement, pages
      correctement découpées
- [x] `npm run build` passe

**Dependencies :** Task 2

**Files likely touched :**
- `app/api/_lib/providers/ocr/gemini.ts`

**Estimated scope :** S

---

### Task 4 : OCR OpenRouter
**Description :** Implémenter `ocr/openrouter.ts` avec un modèle vision
`:free`. **Avant de coder**, vérifier la liste actuelle des modèles
gratuits vision-capable via `GET https://openrouter.ai/api/v1/models`
(la liste "free" change souvent).

**Acceptance criteria :**
- [x] Modèle confirmé disponible et gratuit au moment du codage (relevé
      via `GET /api/v1/models` le 2026-09-11 : `google/gemma-4-31b-it:free`).
- [ ] `openRouterOcrProvider.run()` retourne un `OcrResult` exploitable sur
      un vrai PDF/image — **code écrit, non testé en conditions réelles**.
- [x] Erreur claire si `OPENROUTER_API_KEY` absente.

**Verification :**
- [ ] `OCR_PROVIDER=openrouter` sur un vrai PDF (**bloqué sur la clé
      réelle** — voir checkpoint Phase 1)
- [x] `npm run build` passe

**Dependencies :** Task 2, clé `OPENROUTER_API_KEY` renseignée par
l'utilisateur pour le test réel (le code peut être écrit avant, le test
d'intégration attend la clé)

**Files likely touched :**
- `app/api/_lib/providers/ocr/openrouter.ts`

**Estimated scope :** S

---

### Task 5 : OCR Cloudflare Workers AI — **ANNULÉE**
**Description initiale :** Implémenter `ocr/cloudflare-workers-ai.ts` avec
un modèle vision, auth via `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID`.

**Pourquoi annulée :** le seul modèle vision de Cloudflare Workers AI
(`@cf/meta/llama-3.2-11b-vision-instruct`) n'accepte qu'une image, pas un
PDF multi-page — contrairement à Mistral/Gemini/OpenRouter qui acceptent
le PDF directement (natif ou via plugin `file-parser`). Rasteriser côté
serveur aurait demandé une nouvelle dépendance (pdfjs-dist + backend
canvas natif), non prévue au plan et fragile en fonction serverless.
Décision validée avec l'utilisateur : Cloudflare Workers AI ne déclare que
la capacité `extraction` dans `providers.config.json` (Task 8), retiré de
`ocrOrder`. Le stub `ocr/cloudflare-workers-ai.ts` reste en place avec un
message d'erreur explicite, atteignable seulement via
`OCR_PROVIDER=cloudflare-workers-ai` (override manuel explicite).

**Files touched (pour documenter la décision) :**
- `app/config/providers.config.json`
- `app/api/_lib/providers/ocr/cloudflare-workers-ai.ts`

---

### Task 6 : OCR Z.ai
**Description :** Implémenter `ocr/zai.ts` avec `glm-4.6v-flash` (vision,
gratuit).

**Acceptance criteria :**
- [ ] `zaiOcrProvider.run()` retourne un `OcrResult` exploitable sur un
      vrai PDF/image.
- [ ] Erreur claire si `ZAI_API_KEY` absente.

**Verification :**
- [ ] `OCR_PROVIDER=zai` sur un vrai PDF (**bloqué sur la clé réelle**)
- [ ] `npm run build` passe

**Dependencies :** Task 2, clé `ZAI_API_KEY` renseignée pour le test réel

**Files likely touched :**
- `app/api/_lib/providers/ocr/zai.ts`

**Estimated scope :** S

---

## Checkpoint : OCR
- [ ] Task 3 testée avec une vraie clé (déjà disponible)
- [ ] Tasks 4-6 implémentées ; tests réels en attente des clés utilisateur
- [ ] `npm run build` passe sur l'ensemble

## Phase 3 : Providers extraction manquants

### Task 7 : Extraction OpenRouter
**Description :** Implémenter `extraction/openrouter.ts` avec un modèle
texte `:free`, en réutilisant `shared.ts`
(`buildExtractionSystemPrompt`/`buildExtractionUserPrompt`/`parseExtractionFields`)
comme le font déjà Gemini et Groq.

**Acceptance criteria :**
- [x] Modèle confirmé disponible et gratuit au moment du codage (relevé
      via `GET /api/v1/models` le 2026-09-11 : `google/gemma-4-26b-a4b-it:free`).
- [ ] `openRouterExtractionProvider.extract()` retourne un
      `ExtractionResult` complet (fields, model, usage si disponible) —
      **code écrit, non testé en conditions réelles**.
- [x] Erreur claire si `OPENROUTER_API_KEY` absente.

**Verification :**
- [ ] `EXTRACTION_PROVIDER=openrouter` sur un vrai devis (**bloqué sur la
      clé réelle**)
- [x] `npm run build` passe

**Dependencies :** Task 2, clé `OPENROUTER_API_KEY`

**Files likely touched :**
- `app/api/_lib/providers/extraction/openrouter.ts`

**Estimated scope :** S

---

### Task 8 : Extraction Cloudflare Workers AI
**Description :** Implémenter `extraction/cloudflare-workers-ai.ts`.

**Acceptance criteria :**
- [x] Modèle texte confirmé disponible dans le catalogue Workers AI
      (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`, confirmé officiel).
- [ ] `cloudflareWorkersAiExtractionProvider.extract()` retourne un
      `ExtractionResult` complet — **code écrit, non testé en conditions
      réelles** (pas de mode JSON confirmé côté API, à surveiller).
- [x] Erreur claire si clés Cloudflare absentes.

**Verification :**
- [ ] `EXTRACTION_PROVIDER=cloudflare-workers-ai` sur un vrai devis
      (**bloqué sur la clé réelle**)
- [x] `npm run build` passe

**Dependencies :** Task 2, clés Cloudflare

**Files likely touched :**
- `app/api/_lib/providers/extraction/cloudflare-workers-ai.ts`

**Estimated scope :** S

---

### Task 9 : Extraction Z.ai
**Description :** Implémenter `extraction/zai.ts` avec `glm-4.7-flash` (ou
`glm-4.5-flash`, gratuit).

**Acceptance criteria :**
- [ ] `zaiExtractionProvider.extract()` retourne un `ExtractionResult`
      complet.
- [ ] Erreur claire si `ZAI_API_KEY` absente.

**Verification :**
- [ ] `EXTRACTION_PROVIDER=zai` sur un vrai devis (**bloqué sur la clé
      réelle**)
- [ ] `npm run build` passe

**Dependencies :** Task 2, clé `ZAI_API_KEY`

**Files likely touched :**
- `app/api/_lib/providers/extraction/zai.ts`

**Estimated scope :** S

---

## Checkpoint : Extraction
- [ ] Tasks 7-9 implémentées ; tests réels en attente des clés utilisateur
- [ ] `npm run build` passe sur l'ensemble

## Phase 4 : Chaîne de bascule générique

### Task 10 : Module de résolution de chaîne
**Description :** Logique pure (testable sans réseau) : étant donné un
ordre de providers + une fonction d'appel générique, essaie chacun dans
l'ordre, détecte une erreur de quota (429 ou flag `isQuotaError`) ou
(extraction seulement) un contexte trop grand, et bascule au suivant.
Retourne le résultat + le nom du provider utilisé + la liste des providers
sautés et pourquoi.

**Acceptance criteria :**
- [ ] Fonction générique (typée, réutilisable pour OCR et extraction) qui
      ne connaît rien des providers concrets — juste "essaie, si erreur de
      quota passe au suivant".
- [ ] Si tous les providers de la liste échouent, l'erreur finale inclut
      l'historique des tentatives (utile pour le tracing et le débogage).
- [ ] Couvre : succès au premier essai, bascule après 429, bascule après
      contexte trop grand (extraction), échec total.

**Verification :**
- [ ] Test unitaire (ou script manuel) avec des providers factices
      (mocks) couvrant les 4 cas ci-dessus
- [ ] `npm run build` passe

**Dependencies :** Task 2 (types de config)

**Files likely touched :**
- `app/api/_lib/providers/chain.ts` (nouveau)

**Estimated scope :** S-M

---

### Task 11 : Brancher la chaîne dans `api/extract.ts`
**Description :** Remplacer `getOcrProvider`/`getExtractionProvider`/
`getLargeDocExtractionProvider`/`pickExtractionProvider` par la chaîne
générique (Task 10), alimentée par `providers.config.json`. Respecte
l'override manuel `OCR_PROVIDER`/`EXTRACTION_PROVIDER` (si défini, force ce
provider, bypass la chaîne — comportement actuel inchangé). Étend le
tracing Langfuse pour enregistrer la séquence de bascule.

**Acceptance criteria :**
- [ ] Sans `OCR_PROVIDER`/`EXTRACTION_PROVIDER` défini, `extract.ts`
      utilise la chaîne (`ocrOrder`/`extractionOrder` du config).
- [ ] Avec `OCR_PROVIDER`/`EXTRACTION_PROVIDER` défini, comportement
      identique à aujourd'hui (un seul provider forcé).
- [ ] La trace Langfuse (`ocr`/`extraction` spans) enregistre le provider
      final utilisé + la raison de la bascule le cas échéant + les
      providers sautés (au minimum leur nom et la cause).
- [ ] Les réponses d'erreur HTTP existantes (`502` sur échec OCR/extraction)
      restent cohérentes quand *tous* les providers de la chaîne échouent.

**Verification :**
- [ ] Test manuel : clé invalide sur le 1er provider OCR → bascule visible
      vers le suivant dans la réponse/logs
- [ ] Test manuel end-to-end avec un vrai PDF, chaîne complète activée
- [ ] `npm run build` passe

**Dependencies :** Task 10, Tasks 3-9 (au moins partiellement — peut
démarrer dès que 2-3 providers par tâche sont prêts)

**Files likely touched :**
- `app/api/extract.ts`
- `app/api/_lib/tracing/*` (types d'attributs de trace)

**Estimated scope :** M

---

### Task 12 : Retirer `LARGE_DOC_EXTRACTION_PROVIDER`
**Description :** Supprimer l'env var et le code associé
(`getLargeDocExtractionProvider`, constante `LARGE_DOC_CHAR_THRESHOLD`),
remplacés par le seuil de contexte générique par provider dans
`providers.config.json` + la logique de Task 10/11.

**Confirmé par l'utilisateur.**

**Acceptance criteria :**
- [ ] `LARGE_DOC_EXTRACTION_PROVIDER` disparaît de `.env.example`, du code,
      et de toute doc associée.
- [ ] Le cas "document > seuil pour Groq → bascule vers Gemini" continue de
      fonctionner via la chaîne générique (non-régression).
- [ ] `choix_techniques.md` reflète ce changement (fusionné avec Task 13).

**Verification :**
- [ ] Reproduire le cas d'usage documenté dans `choix_techniques.md`
      ("devis de plus d'une dizaine de pages") → toujours basculé vers
      Gemini via la chaîne
- [ ] `npm run build` passe

**Dependencies :** Task 11, confirmation utilisateur

**Files likely touched :**
- `app/api/extract.ts`
- `app/api/_lib/providers/extraction/index.ts`
- `app/.env.example`

**Estimated scope :** XS-S

---

## Checkpoint : Chaîne complète
- [ ] Bascule sur 429 vérifiée (au moins un cas simulé)
- [ ] Bascule sur contexte trop grand vérifiée (extraction)
- [ ] Test end-to-end avec un vrai PDF et de vraies clés pour au moins un
      provider par nouveau fournisseur
- [ ] `npm run build` passe
- [ ] Revue avec l'utilisateur avant Phase 5

## Phase 5 : Documentation

### Task 13 : `choix_techniques.md`
**Description :** Entrée brève et synthétique (contexte → décision →
alternatives écartées) sur le passage à une chaîne de fournisseurs
génériques avec bascule automatique, cœur de l'application.

**Acceptance criteria :**
- [ ] Entrée cohérente avec le style existant (court, factuel, pas de
      redite du code).
- [ ] Mentionne explicitement le remplacement de
      `LARGE_DOC_EXTRACTION_PROVIDER` s'il a été retiré (Task 12).

**Verification :**
- [ ] Relecture — respecte la consigne projet ("très bref et synthétique",
      "uniquement ce qui touche au cœur de l'application")

**Dependencies :** Task 12

**Files likely touched :**
- `choix_techniques.md`

**Estimated scope :** XS

---

## Checkpoint final
- [ ] Toutes les tâches ci-dessus cochées
- [ ] `choix_techniques.md` à jour
- [ ] Proposer `/code-review-and-quality`, puis proposer une PR (consigne
      du projet une fois la branche de feature entièrement implémentée)
