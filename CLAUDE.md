# devis-extraction-pdf-linting

L'objectif est une application web (`app/`) qui extrait des champs structurés
depuis des devis au format PDF : OCR puis extraction par LLM, champs pilotés
par une config JSON, providers pluggables (OCR : Mistral/Gemini/Cloudflare
Workers AI/OpenRouter/Z.AI ; extraction : Groq/Gemini/Cloudflare Workers
AI/OpenRouter/Z.AI). Frontend Vite, backend en fonction serverless Vercel.

IL faut mettre à jour choix_techniques.md uniquement ce qui touche au coeur de l'application. Il faut être très bref et synthétique.

Lorsque une branche git de feature à été implémenté entièrement avec le skill /incremental-implementation , proposer d'utiliser le skill /code-review-and-quality , ensuite tu proposera de faire une PR

lorsque j'utilise le skill /interview-me ou /idea-refine, ne code jamais rien, il faut ensuite demander à passer à la phase /planning-and-task-breakdown
