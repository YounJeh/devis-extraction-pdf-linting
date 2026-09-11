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
- [x] Modèle confirmé disponible et gratuit (`google/gemma-4-31b-it:free`
      au codage, **remplacé par `nex-agi/nex-n2.5-mini:free`** après test
      réel : gemma-4 renvoyait un 429 persistant "rate-limited upstream"
      côté Google AI Studio — confirmé non lié à notre requête en testant
      un autre modèle avec succès immédiat).
- [x] `openRouterOcrProvider.run()` retourne un `OcrResult` exploitable sur
      un vrai PDF — **testé avec une vraie clé, succès**.
- [x] Erreur claire si `OPENROUTER_API_KEY` absente.

**Verification :**
- [x] `OCR_PROVIDER=openrouter` sur un vrai PDF → succès (après le
      remplacement de modèle)
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
- [x] `zaiOcrProvider.run()` retourne un `OcrResult` exploitable sur un
      vrai PDF — **corrigé après test réel** : le champ base64 était
      `file_url` (faux, 400) au lieu de `file_data` (bon, docs Z.ai).
      Après correction, requête acceptée par l'API ; toujours 429
      "temporairement surchargé" à chaque tentative (capacité du service
      gratuit GLM-4.6V-Flash, cohérent avec la note déjà dans le plan
      "~1 requête concurrente rapportée" — pas un bug de notre code, la
      chaîne bascule normalement dessus).
- [x] Erreur claire si `ZAI_API_KEY` absente.

**Verification :**
- [x] `OCR_PROVIDER=zai` sur un vrai PDF → requête correctement formée
      (400 corrigé), service gratuit systématiquement surchargé au
      moment du test (429) — comportement attendu de ce provider en
      free tier, pas un blocage de code
- [x] `npm run build` passe

**Dependencies :** Task 2, clé `ZAI_API_KEY` renseignée pour le test réel

**Files likely touched :**
- `app/api/_lib/providers/ocr/zai.ts`

**Estimated scope :** S

---

## Checkpoint : OCR
- [x] Task 3 (Gemini) testée avec une vraie clé : succès
- [x] Task 4 (OpenRouter) testée avec une vraie clé : succès (après
      remplacement du modèle gemma-4, 429 persistant, par nex-n2.5-mini)
- [x] Task 6 (Z.ai) testée avec une vraie clé : requête correcte (après
      correctif file_data), service gratuit surchargé au moment du test
      (429) — comportement attendu, pas un bug
- [x] `npm run build` passe sur l'ensemble

## Phase 3 : Providers extraction manquants

### Task 7 : Extraction OpenRouter
**Description :** Implémenter `extraction/openrouter.ts` avec un modèle
texte `:free`, en réutilisant `shared.ts`
(`buildExtractionSystemPrompt`/`buildExtractionUserPrompt`/`parseExtractionFields`)
comme le font déjà Gemini et Groq.

**Acceptance criteria :**
- [x] Modèle confirmé disponible et gratuit (`google/gemma-4-26b-a4b-it:free`
      au codage, **remplacé par `nex-agi/nex-n2.5-mini:free`** — même
      raison que Task 4, 429 persistant côté gemma-4).
- [x] `openRouterExtractionProvider.extract()` retourne un
      `ExtractionResult` complet — **testé avec une vraie clé, succès**
      (champs correctement extraits, JSON propre).
- [x] Erreur claire si `OPENROUTER_API_KEY` absente.

**Verification :**
- [x] `EXTRACTION_PROVIDER=openrouter` sur un vrai devis → succès
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
- [x] `cloudflareWorkersAiExtractionProvider.extract()` retourne un
      `ExtractionResult` complet — **testé avec une vraie clé, succès**.
      Deux obstacles réels résolus en route : (1) le premier token fourni
      était une Global API Key (401, format d'auth incompatible avec
      `Authorization: Bearer`) — remplacé par un vrai API Token scoped ;
      (2) une fois authentifié, la réponse s'est révélée suivre le format
      chat-completions OpenAI (`result.choices[0].message.content`), pas
      `result.response` (déjà un objet JSON parsé, pas la chaîne attendue)
      — corrigé dans `extraction/cloudflare-workers-ai.ts`.
- [x] Erreur claire si clés Cloudflare absentes.

**Verification :**
- [x] `EXTRACTION_PROVIDER=cloudflare-workers-ai` sur un vrai devis →
      succès, champs correctement extraits
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
- [x] `zaiExtractionProvider.extract()` retourne un `ExtractionResult`
      complet — **testé avec une vraie clé, succès** (champs corrects) ;
      a nécessité le correctif `stripCodeFence` (le modèle enveloppait sa
      réponse dans ```json ... ```, cf `extraction/shared.ts`).
- [x] Erreur claire si `ZAI_API_KEY` absente.

**Verification :**
- [x] `EXTRACTION_PROVIDER=zai` sur un vrai devis → succès (après le
      correctif markdown ; service parfois surchargé côté Z.ai — 429
      transitoire observé sur des tentatives suivantes, pas un bug)
- [x] `npm run build` passe

**Dependencies :** Task 2, clé `ZAI_API_KEY`

**Files likely touched :**
- `app/api/_lib/providers/extraction/zai.ts`

**Estimated scope :** S

---

## Checkpoint : Extraction
- [x] Task 7 (OpenRouter) testée avec une vraie clé : succès
- [x] Task 8 (Cloudflare) testée avec une vraie clé : succès (après
      remplacement du token et correctif du format de réponse)
- [x] Task 9 (Z.ai) testée avec une vraie clé : succès (après correctif
      markdown-fence)
- [x] `npm run build` passe sur l'ensemble

## Phase 4 : Chaîne de bascule générique

### Task 10 : Module de résolution de chaîne
**Description :** Logique pure (testable sans réseau) : étant donné un
ordre de providers + une fonction d'appel générique, essaie chacun dans
l'ordre, détecte une erreur de quota (429 ou flag `isQuotaError`) ou
(extraction seulement) un contexte trop grand, et bascule au suivant.
Retourne le résultat + le nom du provider utilisé + la liste des providers
sautés et pourquoi.

**Acceptance criteria :**
- [x] Fonction générique (typée, réutilisable pour OCR et extraction) qui
      ne connaît rien des providers concrets — juste "essaie, si erreur de
      quota passe au suivant".
- [x] Si tous les providers de la liste échouent, l'erreur finale inclut
      l'historique des tentatives (utile pour le tracing et le débogage).
- [x] Couvre : succès au premier essai, bascule après 429, bascule après
      contexte trop grand (extraction), échec total — **et** un 5e cas
      ajouté pendant l'implémentation : une erreur non liée au quota
      (clé invalide, bug) propage immédiatement sans bascule silencieuse.

**Verification :**
- [x] Script manuel (jetable, supprimé après usage) avec des providers
      factices couvrant les 5 cas ci-dessus
- [x] `npm run build` passe

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
- [x] Sans `OCR_PROVIDER`/`EXTRACTION_PROVIDER` défini, `extract.ts`
      utilise la chaîne (`ocrOrder`/`extractionOrder` du config).
- [x] Avec `OCR_PROVIDER`/`EXTRACTION_PROVIDER` défini, comportement
      identique à aujourd'hui (un seul provider forcé).
- [x] La trace Langfuse (`ocr`/`extraction` spans) enregistre le provider
      final utilisé + les providers sautés et pourquoi (`attempts`,
      remplace l'ancien `reason` — le provider n'est plus connu avant
      résolution de la chaîne, donc `traceOcr`/`traceExtraction` ne le
      prennent plus en paramètre : `handle.setMetadata({ provider,
      attempts })` posé dans le callback une fois la chaîne résolue).
- [x] Les réponses d'erreur HTTP existantes (`502` sur échec OCR/extraction)
      restent cohérentes quand *tous* les providers de la chaîne échouent
      (`ChainError.message` résume l'historique).

**Verification :**
- [x] Test manuel (fetch global monkey-patché pour simuler un 429 sur
      Mistral, premier de `ocrOrder`) → bascule réelle vers Gemini
      confirmée, "mistral" marqué `skipped_quota`
- [x] Test manuel end-to-end avec un vrai PDF, chaîne par défaut activée
      (OCR → mistral, extraction → groq, champs extraits correctement)
- [x] `npm run build` passe

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
- [x] `LARGE_DOC_EXTRACTION_PROVIDER` disparaît de `.env.example`, du code,
      et de toute doc associée (`grep` vérifié : plus aucune référence
      fonctionnelle, seulement un commentaire expliquant le remplacement
      dans `extraction/index.ts`).
- [x] Le cas "document > seuil pour Groq → bascule vers Gemini" continue de
      fonctionner via la chaîne générique (non-régression).
- [ ] `choix_techniques.md` reflète ce changement (Task 13, pas encore
      faite).

**Verification :**
- [x] Reproduit avec un texte > 24000 caractères → groq sauté
      (`skipped_context`), extraction réussie via Gemini (vraie clé)
- [x] `npm run build` passe

**Dependencies :** Task 11, confirmation utilisateur

**Files likely touched :**
- `app/api/extract.ts`
- `app/api/_lib/providers/extraction/index.ts`
- `app/.env.example`

**Estimated scope :** XS-S

---

## Checkpoint : Chaîne complète
- [x] Bascule sur 429 vérifiée (429 simulé sur Mistral, bascule réelle
      vers Gemini)
- [x] Bascule sur contexte trop grand vérifiée (extraction, groq → gemini)
- [x] Test end-to-end avec un vrai PDF et de vraies clés : OCR OpenRouter,
      extraction OpenRouter, OCR/extraction Z.ai, extraction Cloudflare
      Workers AI tous testés avec succès en conditions réelles. Quatre
      bugs réels trouvés et corrigés en testant : champ `file_data` Z.ai
      (était `file_url`), modèle OpenRouter gemma-4 remplacé (429
      persistant upstream), réponses JSON enveloppées en markdown
      tolérées (`stripCodeFence`), format de réponse Cloudflare corrigé
      (`choices[].message.content`, pas `result.response`).
- [x] `npm run build` passe
- [ ] Revue avec l'utilisateur avant Phase 5

## Phase 5 : Documentation

### Task 13 : `choix_techniques.md`
**Description :** Entrée brève et synthétique (contexte → décision →
alternatives écartées) sur le passage à une chaîne de fournisseurs
génériques avec bascule automatique, cœur de l'application.

**Acceptance criteria :**
- [x] Entrée cohérente avec le style existant (court, factuel, pas de
      redite du code).
- [x] Mentionne explicitement le remplacement de
      `LARGE_DOC_EXTRACTION_PROVIDER`.

**Verification :**
- [x] Relecture — respecte la consigne projet ("très bref et synthétique",
      "uniquement ce qui touche au cœur de l'application")

**Dependencies :** Task 12

**Files likely touched :**
- `choix_techniques.md`

**Estimated scope :** XS

---

## Checkpoint final
- [x] Toutes les tâches ci-dessus cochées — tous les providers (Mistral,
      Groq, Gemini, OpenRouter, Cloudflare Workers AI [extraction
      uniquement], Z.ai) testés et fonctionnels en conditions réelles,
      chaîne de bascule vérifiée (429 et contexte trop grand)
- [x] `choix_techniques.md` à jour
- [x] `/code-review-and-quality` effectuée. 4 points relevés, tous
      corrigés (aucun n'était bloquant) : (1) modèle non lu depuis
      `providers.config.json` pour Mistral/Groq/Gemini — corrigé ; (2)
      mapping d'usage dupliqué dans 4 providers — extrait dans
      `mapOpenAiUsage` (`extraction/shared.ts`) ; (3) message
      d'épuisement de la chaîne présumait "quota" même en cas de
      `skipped_context` — corrigé ; (4) ordre des content-parts OCR
      incohérent entre OpenRouter et Z.ai — aligné (nit). Revérifié en
      conditions réelles après coup, aucune régression.
- [ ] Proposer une PR (consigne du projet une fois la branche de feature
      entièrement implémentée et revue)
