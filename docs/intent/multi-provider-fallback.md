# Intent : chaîne de fournisseurs OCR/extraction avec bascule automatique sur quotas gratuits

Confirmé le 2026-09-11 via `/interview-me`.

## Résumé

- **Objectif** : généraliser le mécanisme de bascule déjà présent (aujourd'hui : un
  seul provider par défaut + un seul fallback fixe "gros doc" vers Gemini) en une
  vraie chaîne ordonnée de fournisseurs par tâche (OCR / extraction), pour toujours
  essayer les quotas gratuits avant de payer.
- **Portée** : finir d'implémenter les 3 providers OCR + 3 providers extraction
  actuellement stubs (Cloudflare Workers AI, Z.ai, OpenRouter — fichiers qui font
  `throw new Error("... non implémenté")`), avec clés API en variables d'environnement
  (même pattern que `MISTRAL_API_KEY` / `GEMINI_API_KEY` / `GROQ_API_KEY` existants).
- **Config** : nouveau `app/config/providers.config.json` (même esprit que
  `fields.config.json`) — par provider : modèle OCR (si dispo), modèle extraction
  (si dispo), quotas gratuits réels (rpm/rpd/tpm, à rechercher avec source/date), et
  les deux ordres d'essai (OCR / extraction).
- **Bascule** : réactive uniquement (erreur 429/quota du provider → provider suivant
  dans l'ordre), pas de comptage persistant (pas de nouvelle dépendance DB/KV, aucune
  n'existe dans le projet). "Contexte trop grand" ne déclenche la bascule que côté
  extraction (comme aujourd'hui, via l'équivalent généralisé de
  `LARGE_DOC_EXTRACTION_PROVIDER`), pas côté OCR.
- **Débit max** : stocké dans le config à titre informatif seulement, pas de
  throttling actif côté code (un utilisateur = un PDF à la fois en usage normal).
- **Modèles** : à rechercher et proposer par l'agent (un modèle OCR et/ou extraction
  gratuit pertinent par nouveau provider), à valider avant implémentation.
- **Compatibilité** : `OCR_PROVIDER` / `EXTRACTION_PROVIDER` restent un override
  manuel optionnel (comportement actuel) au-dessus de la nouvelle chaîne auto par
  défaut.

## Hors scope

- UI de saisie de clés API côté frontend (les clés restent des variables d'env,
  cohérent avec la philosophie mono-déploiement du projet).
- Comptage réel des appels/jour/mois (demanderait une persistance, ex. Vercel KV —
  non retenu).
- Throttling actif du débit max.
- Bascule OCR sur taille de document (seule l'extraction bascule sur "contexte trop
  grand").

## Suite

Prochaine étape : `/planning-and-task-breakdown` pour découper le travail
(`providers.config.json`, recherche des modèles/quotas gratuits actuels,
implémentation des 3×2 providers stubs, logique de chaîne réactive, `.env.example`).

**Point de blocage attendu** : une fois le `.env.example` mis à jour (clés
Cloudflare Workers AI, Z.ai, OpenRouter + variables associées), l'agent doit
s'arrêter et demander à l'utilisateur de renseigner les vraies clés API dans son
`.env` local avant de pouvoir lancer de vrais tests d'intégration contre ces
fournisseurs.
