# MindKit

Outil en ligne de cartes conceptuelles pour élèves : éditeur de mindmaps interactif, partage en lecture seule, sauvegarde automatique en cloud.

> Rédigé pour les élèves de Steve Masson autour des sept piliers de la neuroéducation, mais utilisable pour n'importe quel sujet.

## Fonctionnalités

- **Éditeur visuel** : noeuds éditables, palettes de couleurs, drag & drop pour repositionner ou re-rattacher (re-parent) une étiquette.
- **Synchronisation Markdown bidirectionnelle** : panneau latéral redimensionnable, on écrit en Markdown ou dans la mindmap, les deux restent en phase.
- **Auto-disposition** : ré-arrange la carte en layout horaire gauche/droite et recentre.
- **Collapse / Expand** : repli des sous-arbres pour explorer une carte volumineuse à la NotebookLM.
- **Partage** : génération d'un lien public en lecture seule pour les élèves.
- **Auth Firebase** : Google OAuth ou e-mail / mot de passe.
- **Sauvegarde live** sur Firestore (debounce 600 ms).

## Stack

- [Next.js 15](https://nextjs.org/) (App Router) + TypeScript + React 19
- [Tailwind CSS v4](https://tailwindcss.com/) (theme custom dans `src/app/globals.css`)
- [Firebase](https://firebase.google.com/) : Auth + Firestore (+ App Hosting prévu)
- Layout fait main (SVG pour les liens, divs absolues pour les étiquettes)

## Démarrage rapide

```bash
# 1. Installer les dépendances
npm install

# 2. Renseigner les clés Firebase
cp .env.local.example .env.local
# puis remplir NEXT_PUBLIC_FIREBASE_* avec la config de votre projet Firebase

# 3. Démarrer le dev server
npm run dev
# → http://localhost:3000
```

### Configuration Firebase

Dans la console Firebase :

1. **Authentication** → activer *Email/Password* et *Google*.
2. **Firestore** → créer la base en mode production.
3. **Rules** → coller le contenu de `firestore.rules`.
4. **Indexes** → un index composite `ownerId + updatedAt` est nécessaire (créé automatiquement la première fois qu'on liste les cartes — Firebase fournit le lien de création).

## Scripts npm

| Script | Effet |
|---|---|
| `npm run dev` | Dev server avec Turbopack |
| `npm run build` | Build de production |
| `npm run start` | Serveur de production |
| `npm run lint` | ESLint |

## Architecture

Voir [`AGENTS.md`](./AGENTS.md) pour une description détaillée à destination des agents IA et des contributeurs.

```
src/
├── app/            # routes Next.js (App Router)
│   ├── page.tsx                  # accueil — liste des cartes
│   ├── maps/[id]/page.tsx        # éditeur d'une carte
│   ├── share/[token]/page.tsx    # vue lecture seule (élèves)
│   └── globals.css               # design system
├── components/     # MindMap, MarkdownPanel, AuthShell, Logo, ShareDialog
└── lib/            # types, layout, markdown, firebase, firestore, auth-context
```

## Déploiement

- Préparé pour Firebase App Hosting (voir `apphosting.yaml`).
- Compatible Vercel sans modification (les variables `NEXT_PUBLIC_FIREBASE_*` doivent être définies dans le dashboard).

## Licence

Projet pédagogique — pas de licence publiée pour l'instant.
