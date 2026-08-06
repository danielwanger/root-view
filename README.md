# Root View

A custom, hierarchy-aware graph visualization plugin for [Obsidian](https://obsidian.md), built as an alternative to the native Graph View — designed for vaults with thousands of notes where the default graph becomes unreadable.

## Why

Obsidian's built-in graph view treats every note the same size and offers no way to distinguish structurally important notes ("hubs") from leaf notes, nor to explore a note's ancestry/descendants in isolation. Root View was built to solve that for a personal knowledge base with a strict parent → child linking convention (general concepts link to specific instances).

## Features

- **Reachability-based node sizing** — notes with more reachable connections render larger
- **Automatic core & hub detection** — globally important "root" notes (orange) and locally dense cluster hubs (yellow) are detected and labeled automatically, independent of manual tagging
- **Cycle detection** — strongly connected components (via Tarjan's algorithm) are found and rendered as dashed edges, distinguishing true hierarchy from cross-links
- **Directional arrows** — edges show parent → child direction at a glance
- **Zoom-stable labels** — core/hub labels stay legible at any zoom level; leaf labels fade in as you zoom closer
- **Label collision avoidance** — an iterative de-overlap pass keeps important labels readable even in dense regions
- **Click to open** — clicking any node opens the corresponding note
- **Drag to reposition** — manually rearrange nodes; the layout settles back around your changes
- **Search** — find any note by name, with a results list and auto-zoom to the match
- **Ancestor/descendant filter** — select a note to see only its strict ancestor chain and descendant chain (never cross-contaminated with siblings), rendered on its own for performance and clarity
- **Performance-conscious by design** — the graph loads a filtered subgraph on demand rather than the entire vault by default, keeping CPU load low on large vaults (1000+ notes)

## Installation

This plugin isn't yet on the Community Plugin Store. To install manually:

1. Clone this repository
2. `npm install`
3. `npm run build`
4. Copy (or symlink) the folder into `<YourVault>/.obsidian/plugins/root-view/`
5. Enable "Root View" in Obsidian's Community Plugins settings

For development with live rebuilds:
```bash
npm run dev
```

## Usage

Open Root View from the ribbon icon. You'll see a start screen with two options:

- **Load full graph** — renders your entire vault (best for smaller vaults or a full overview)
- **Filter to a note** — search for a specific note and load only its ancestor + descendant chain, which is dramatically faster on large vaults

Once loaded:
- **Scroll** to zoom, **drag the background** to pan
- **Click a node** to open that note
- **Drag a node** to reposition it manually
- Use the **search box** (top-left) to locate and jump to any visible note
- Use the **filter box** to switch to a different note's ancestor/descendant view without returning to the start screen

## How it works

- Node data comes from Obsidian's `app.metadataCache.resolvedLinks`
- Reachability is computed via BFS from each note
- "Core" nodes are the top-N notes by global reachability (configurable threshold)
- "Hub" nodes are notes with many direct outgoing links, independent of reachability — this catches structurally important notes (like a "Movies" index) that reachability alone would miss
- Cycles are detected via Tarjan's strongly-connected-components algorithm, restricted to the currently loaded subgraph
- Layout is a D3 force simulation (`forceManyBody`, `forceLink`, `forceCollide`) with an additional custom radial-spread force to push leaf notes outward from their nearest hub, encouraging thematic clustering in 2D space

## Tech stack

- TypeScript
- [D3.js](https://d3js.org/) (force simulation, zoom, drag)
- esbuild (via the official Obsidian plugin template)

## Status

This is a personal project, actively evolving. It's built around a specific vault convention (strict parent → child linking, general → specific), so results may vary on vaults structured differently.

## License

MIT — see [LICENSE](LICENSE)
