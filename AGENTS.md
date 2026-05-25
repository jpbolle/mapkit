# AGENTS.md

Guide d'orientation pour agents IA (Claude Code, Cursor Agent, Codex, …) travaillant sur **MindKit**.

> Ce document est le compagnon technique du `README.md`. Il se concentre sur les conventions, l'architecture et les pièges à éviter.

---

## Conventions

- **Langue** : tout le code, les commentaires, l'UI et la documentation sont en **français**. Pas d'emojis dans le code ou les fichiers, sauf demande explicite.
- **TypeScript strict** : pas d'`any` superflu. Les composants client portent `"use client"` en première ligne.
- **Pas de markdown récapitulatif spontané** : ne pas créer de `CHANGELOG.md`, de notes de release, etc. sans demander.
- **Pas de commit non sollicité** : ne pas exécuter `git commit` à moins que l'utilisateur ne le demande explicitement.

---

## Stack & dépendances

- Next.js 15 (App Router, Turbopack en dev) — `next.config.ts` règle `outputFileTracingRoot` pour éviter le warning de workspace root.
- React 19, TypeScript 5.
- Tailwind CSS v4 via `@tailwindcss/postcss` — variables custom dans `src/app/globals.css`.
- Firebase 11 : Auth (Google + Email/Password) et Firestore (modular SDK).
- `uuid` pour générer les IDs des nœuds et tokens de partage.

Pas de Redux, pas de Zustand : tout l'état vit dans React (hooks, context, refs).

---

## Architecture des dossiers

```
src/
├── app/
│   ├── layout.tsx                # racine HTML, AuthProvider, polices Geist/Fraunces, suppressHydrationWarning
│   ├── globals.css               # design system (couleurs, typo, .paper-card, .btn, .input, animations)
│   ├── page.tsx                  # accueil : liste des cartes utilisateur, bouton de création, bouton « charger l'exemple »
│   ├── maps/[id]/page.tsx        # éditeur d'une carte (titre éditable, MindMap, MarkdownPanel, ShareDialog)
│   └── share/[token]/page.tsx    # vue publique lecture seule
├── components/
│   ├── MindMap.tsx               # canvas interactif (pan/zoom, drag, édition, collapse) — gros fichier (~1100 lignes)
│   ├── MarkdownPanel.tsx         # sidebar Markdown éditable et redimensionnable
│   ├── AuthShell.tsx             # écran d'auth (Google + email)
│   ├── Logo.tsx                  # logo + lien vers la home
│   └── ShareDialog.tsx           # popover de gestion du partage
└── lib/
    ├── types.ts                  # MindNode, MindMapDoc, MindMapSummary, NodeShape, NodePalette
    ├── layout.ts                 # algorithme de layout (purement déterministe, pas d'effet de bord)
    ├── markdown.ts               # parseMarkdownOutline, markdownToMindNodes, nodesToMarkdown, reconcileFromMarkdown
    ├── firebase.ts               # initialisation lazy du SDK
    ├── firestore.ts              # CRUD mindmaps (createMap, listMapsForUser, getMap, getMapByShareToken, saveMap, deleteMap, enableSharing, disableSharing)
    ├── auth-context.tsx          # AuthProvider + useAuth (Google/email)
    └── seed.ts                   # carte d'exemple « 7 piliers de la neuroéducation »
```

À la racine :

- `firestore.rules` — règles de sécurité Firestore.
- `firestore.indexes.json` — index composite `ownerId + updatedAt`.
- `firebase.json` — lie rules + indexes.
- `apphosting.yaml` — config Firebase App Hosting (variables d'environnement).
- `.env.local` — clés Firebase (ignoré par git).
- `.env.local.example` — gabarit.

---

## Modèle de données

### MindNode (`src/lib/types.ts`)

```ts
interface MindNode {
  id: string;
  parentId: string | null;       // null pour la racine
  text: string;
  shape: "root" | "branch" | "leaf";
  palette: "ink" | "brand" | "accent" | "leaf" | "violet";
  collapsed?: boolean;
  order: number;                 // ordre parmi les frères
  manualX?: number;              // *offset* (delta) par rapport à l'auto-layout
  manualY?: number;              // *offset* (delta) par rapport à l'auto-layout
}
```

> ⚠️ `manualX` et `manualY` sont des **deltas**, pas des coordonnées absolues. Cf. section *Layout* plus bas.

### MindMapDoc (Firestore document)

Stocké dans la collection `mindmaps` :

```ts
interface MindMapDoc {
  id: string;                  // = doc id Firestore
  title: string;
  ownerId: string;             // = uid Firebase Auth
  ownerEmail?: string | null;
  nodes: MindNode[];           // tableau plat (parentId chaîne la hiérarchie)
  shareToken: string | null;   // null si non partagé
  isPublic: boolean;           // true si lecture publique activée
  createdAt: number;           // ms epoch (converti depuis Timestamp Firestore)
  updatedAt: number;
}
```

### Règles Firestore

Voir `firestore.rules`. Résumé :
- Lecture : propriétaire OU `isPublic == true` (pour `/share/[token]`).
- Création : utilisateur authentifié, doit s'auto-désigner `ownerId`.
- Update / delete : propriétaire uniquement, `ownerId` non modifiable.

---

## Layout (`src/lib/layout.ts`)

Le layout est **déterministe** : `layoutMindMap(nodes, collapsedIds)` → `{ layout, width, height }`.

- **Distribution** : moitié des branches niveau 1 à droite (haut → bas), moitié à gauche (haut → bas, mais l'ordre Markdown est inversé pour que la lecture clockwise marche). Choix entériné après essai 4-côtés trop chaotique.
- **Sous-arbres** : tous en axe **horizontal** (parent à gauche, enfants empilés verticalement à droite). Le côté gauche miroite l'axe X.
- **Alignement** : tous les frères ont leur boîte alignée sur la même `x` (column nette). Le parent est centré verticalement contre la pile.
- **Espacement** : `gapsForParentDepth(depth)` retourne `{ h, v }`. Valeurs dégressives selon la profondeur. Touchez ces valeurs pour rendre le layout plus ou moins aéré.
- **Shift final** : tout le layout est translaté pour que `minX, minY` soient à `margin = 80`. Important pour le rendu SVG.

### `manualX` / `manualY` = offsets

Quand l'utilisateur déplace une étiquette, on stocke un **delta** entre la position auto-calculée et la position voulue. Le layout fait :

```ts
const totalDx = accDx + (node.manualX ?? 0);
const totalDy = accDy + (node.manualY ?? 0);
lp.x += totalDx;
lp.y += totalDy;
```

`accDx/accDy` = somme des offsets cascadés depuis les ancêtres : déplacer un parent fait suivre tous ses descendants automatiquement.

> ⚠️ **NE PAS** stocker la position rendue (post-shift) dans `manualX/Y`. C'était un bug : à chaque rendu le shift se ré-appliquait et le nœud « volait » loin.

### Bouton Auto-disposition

`resetAllLayout()` dans `MindMap.tsx` retire toutes les `manualX/Y` puis déclenche un recentrage.

---

## Composant MindMap (`src/components/MindMap.tsx`)

Gros fichier (~1100 lignes) qui gère :

- **Pan** (drag du fond) et **zoom** (molette, sensibilité douce `factor = 1.015`).
- **Drag de nœud** : déplace le sous-arbre. Seul le nœud déplacé voit son `manualX/Y` modifié, les descendants suivent par la cascade.
- **Reparent** par drag-and-drop : si on relâche au-dessus d'un autre nœud (qui n'est ni soi-même ni un descendant), on change `parentId` et on retire les `manualX/Y` du sous-arbre déplacé.
- **Édition inline** : double-clic ou `F2`, `Enter` pour valider, `Esc` pour annuler.
- **Raccourcis** : `Tab` ajoute un enfant, `Enter` un frère, `Backspace` supprime, etc.
- **Collapse / expand** : par nœud (chevron) ou globalement.
- **Affordances** : bouton chevron, bouton `+` (ajouter enfant), bouton `×` (supprimer) positionnés sur le bord extérieur via `sideButtonPosition(side)`.
- **Inspecteur** (`SelectionInspector`) : panneau flottant avec choix de palette + bouton « réinitialiser la position ».
- **Liens** : courbes de Bézier en SVG. L'orientation (horizontale ou verticale) est choisie selon `Math.abs(ddx) >= Math.abs(ddy)`.
- **Anti-duplications** : `useMemo` `safeNodes` filtre les doublons d'ID au cas où ; un `useEffect` persiste la version nettoyée si nécessaire.

### Drag : architecture

```ts
dragState.current = {
  active: boolean;
  nodeId: string | null;
  startClientX, startClientY: number;          // pour calculer le delta
  moved: boolean;                              // anti-clic accidentel (seuil 4 px)
  initialOffset: { x: number; y: number };    // = manualX/Y du nœud au début du drag
  affectedIds: Set<string>;                    // = sous-arbre, pour interdire le drop sur soi
};
```

Pendant le `mousemove` : `manualX = initialOffset.x + dx`. Aucun autre nœud n'est modifié.

---

## Markdown ↔ Mindmap (`src/lib/markdown.ts`)

- `parseMarkdownOutline(md)` : parse les headings `##` / `###` / `####` et les listes à puces avec indentation 2 espaces. Le `# H1` initial est traité comme titre du document.
- `markdownToMindNodes(md, fallbackTitle)` : crée un arbre de `MindNode` from scratch (nouveaux UUIDs).
- `nodesToMarkdown(title, nodes)` : sérialise vers Markdown. Niveaux 1-3 en headings, plus profond en listes à puces.
- `reconcileFromMarkdown(md, existingNodes, fallbackTitle)` : regénère le Markdown **en préservant les IDs** quand c'est possible (matching par chemin de texte). Utilisé par le `MarkdownPanel` pour ne pas perdre les palettes / `manualX/Y` quand on édite côté Markdown.

> ⚠️ Le matching utilise un `Set<string> usedExistingIds` pour qu'un même ancien nœud ne soit pas mappé à plusieurs nouveaux (sinon : « Encountered two children with the same key »).

---

## Auth (`src/lib/auth-context.tsx`)

`AuthProvider` enveloppe l'app dans `src/app/layout.tsx`. Il expose `useAuth()` :

```ts
const { user, loading, signInWithGoogle, signInWithEmail, signUpWithEmail, signOutUser } = useAuth();
```

`user === null` quand non connecté. `loading === true` pendant la vérification du token initial.

---

## Pages

### `/` (accueil)

- Si non connecté → `<AuthShell />`.
- Si connecté → liste des cartes (Firestore `listMapsForUser`), bouton **Nouvelle carte**, bouton **Charger la carte d'exemple** (uniquement si zéro carte). Pas de seed automatique : c'était une source de duplications.

### `/maps/[id]`

L'éditeur. Auto-save Firestore avec debounce 600 ms sur les changements de `nodes` ou de `title`.

### `/share/[token]`

Vue publique lecture seule. Charge via `getMapByShareToken(token)` qui requiert `isPublic == true`.

---

## Pièges connus

1. **Hydratation** : extensions Chrome (LanguageTool, ColorZilla) injectent des attributs sur `<html>` / `<body>`. On a `suppressHydrationWarning` sur les deux dans `src/app/layout.tsx`. Ne pas retirer.
2. **Doublons d'ID** : peuvent apparaître si une vieille version a sauvegardé une carte corrompue. Le composant nettoie défensivement, mais si vous touchez à `markdown.ts`, vérifiez `usedExistingIds` dans `reconcileFromMarkdown`.
3. **manualX/Y absolus** : ancien bug. Si vous voyez du code stocker `lp.x` directement dans `manualX`, c'est cassé. Toujours stocker un delta.
4. **Overflow SVG** : les liens disparaissaient quand un nœud était glissé hors de la bounding box initiale. Solution : `style={{ overflow: "visible" }}` sur le `<svg>` du `MindMap`. Ne pas retirer.
5. **Index Firestore** : `listMapsForUser` requiert un index composite `ownerId asc + updatedAt desc`. Première exécution → erreur Firebase avec un lien de création directe. Aussi déclaré dans `firestore.indexes.json`.
6. **Logo cliquable** : `Logo` retourne un `<Link href="/">` par défaut. Si vous voulez un logo non-cliquable (par ex. dans la modale d'auth), passer `asLink={false}`.

---

## Ajouter une fonctionnalité

Quelques pointeurs :

- **Nouvelle action sur un nœud** (ex : changer la forme) → ajouter dans `SelectionInspector` à la fin de `MindMap.tsx`.
- **Nouveau type de carte** (timeline, carte conceptuelle non-arborescente…) → créer un nouveau composant frère de `MindMap`, et adapter `MindMapDoc` (peut nécessiter un champ `kind`).
- **Nouvelle source d'import** (CSV, JSON…) → ajouter un parser dans `src/lib/` et un bouton sur la page d'accueil.
- **Vue alternative** (présentation, plein écran…) → créer une route sous `src/app/maps/[id]/<vue>/page.tsx`.
- **Modifier l'aération du layout** → toucher uniquement `gapsForParentDepth` dans `src/lib/layout.ts`.

Avant de coder une feature qui touche le layout, **lisez `src/lib/layout.ts` en entier**, c'est court (~280 lignes) et la sémantique des offsets `manualX/Y` est facile à casser.

---

## Tests

Pas de tests automatisés pour l'instant. Vérifiez à la main :

1. Création d'une carte vide.
2. Import de la carte d'exemple.
3. Drag d'une étiquette → suit la souris sans saut.
4. Auto-disposition → recentre, layout aéré, ordre horaire respecté.
5. Édition Markdown → la mindmap se met à jour en temps réel sans perte d'IDs.
6. Partage → le lien `/share/[token]` est lisible déconnecté.
7. Suppression → la carte disparaît de la liste, plus duplications fantômes dans Firestore.
