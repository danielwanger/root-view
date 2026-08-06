export interface RawLinks {
  [source: string]: { [target: string]: number };
}

export function computeReachability(
  resolvedLinks: RawLinks,
  allNodeIds: string[]
): Map<string, number> {
  const reachability = new Map<string, number>();

  for (const startId of allNodeIds) {
    if (!resolvedLinks[startId] || Object.keys(resolvedLinks[startId]).length === 0) {
      reachability.set(startId, 0);
      continue;
    }

    const visited = new Set<string>();
    const queue: string[] = [startId];
    visited.add(startId);

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = resolvedLinks[current] ?? {};
      for (const next in neighbors) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }

    reachability.set(startId, visited.size - 1);
  }

  return reachability;
}

export function computeCoreNodes(
  reachability: Map<string, number>,
  options: { relativeThreshold?: number; maxCoreNodes?: number } = {}
): Set<string> {
  const { relativeThreshold = 0.3, maxCoreNodes = 15 } = options;

  const maxReach = Math.max(1, ...Array.from(reachability.values()));
  const threshold = maxReach * relativeThreshold;

  const candidates = Array.from(reachability.entries())
    .filter(([, reach]) => reach >= threshold)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxCoreNodes)
    .map(([id]) => id);

  return new Set(candidates);
}

/**
 * Findet lokale Cluster-Hubs: Knoten mit vielen direkten ausgehenden Links,
 * unabhängig von globaler Reachability. Erfasst Knoten wie "Movies", die
 * viele Blätter direkt verlinken, aber selbst wenig "tief" vernetzt sind.
 */
export function computeClusterHubs(
  resolvedLinks: RawLinks,
  allNodeIds: string[],
  options: { minDirectLinks?: number; maxHubs?: number } = {}
): Set<string> {
  const { minDirectLinks = 5, maxHubs = 40 } = options;

  const candidates = allNodeIds
    .map(id => ({ id, outLinks: Object.keys(resolvedLinks[id] ?? {}).length }))
    .filter(d => d.outLinks >= minDirectLinks)
    .sort((a, b) => b.outLinks - a.outLinks)
    .slice(0, maxHubs)
    .map(d => d.id);

  return new Set(candidates);
}

export function findStronglyConnectedComponents(
  resolvedLinks: RawLinks,
  allNodeIds: string[]
): Map<string, number> {
  let index = 0;
  const indices = new Map<string, number>();
  const lowlinks = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const nodeToComponent = new Map<string, number>();
  let componentId = 0;

  function strongConnect(v: string) {
    indices.set(v, index);
    lowlinks.set(v, index);
    index++;
    stack.push(v);
    onStack.add(v);

    const neighbors = resolvedLinks[v] ?? {};
    for (const w in neighbors) {
      if (!indices.has(w)) {
        strongConnect(w);
        lowlinks.set(v, Math.min(lowlinks.get(v)!, lowlinks.get(w)!));
      } else if (onStack.has(w)) {
        lowlinks.set(v, Math.min(lowlinks.get(v)!, indices.get(w)!));
      }
    }

    if (lowlinks.get(v) === indices.get(v)) {
      const currentComponent: string[] = [];
      let w: string;
      do {
        w = stack.pop()!;
        onStack.delete(w);
        currentComponent.push(w);
        nodeToComponent.set(w, componentId);
      } while (w !== v);
      componentId++;
    }
  }

  for (const id of allNodeIds) {
    if (!indices.has(id)) {
      strongConnect(id);
    }
  }

  return nodeToComponent;
}

export function markCyclicLinks(
  links: { source: string; target: string }[],
  nodeToComponent: Map<string, number>
): Set<string> {
  const componentSize = new Map<number, number>();
  for (const comp of nodeToComponent.values()) {
    componentSize.set(comp, (componentSize.get(comp) ?? 0) + 1);
  }

  const cyclicLinkKeys = new Set<string>();
  for (const link of links) {
    const sourceComp = nodeToComponent.get(link.source);
    const targetComp = nodeToComponent.get(link.target);
    if (
      sourceComp !== undefined &&
      sourceComp === targetComp &&
      (componentSize.get(sourceComp) ?? 0) > 1
    ) {
      cyclicLinkKeys.add(`${link.source}→${link.target}`);
    }
  }
  return cyclicLinkKeys;
}

/**
 * Baut eine umgekehrte Link-Map: für jeden Knoten, wer verlinkt AUF ihn.
 */
export function buildReverseLinks(resolvedLinks: RawLinks): RawLinks {
  const reverse: RawLinks = {};
  for (const source in resolvedLinks) {
    for (const target in resolvedLinks[source]) {
      if (!reverse[target]) reverse[target] = {};
      reverse[target][source] = 1;
    }
  }
  return reverse;
}

/**
 * Vorfahren: nur rückwärts über eingehende Links (wer verlinkt auf mich,
 * wer verlinkt auf die, usw.) — niemals vorwärts abbiegen.
 */
export function getAncestors(reverseLinks: RawLinks, startId: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const parents = reverseLinks[current] ?? {};
    for (const parent in parents) {
      if (!visited.has(parent)) {
        visited.add(parent);
        queue.push(parent);
      }
    }
  }

  return visited;
}

/**
 * Nachkommen: nur vorwärts über ausgehende Links (wen verlinke ich,
 * wen verlinken die, usw.) — niemals rückwärts abbiegen.
 */
export function getDescendants(resolvedLinks: RawLinks, startId: string): Set<string> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = resolvedLinks[current] ?? {};
    for (const child in children) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }

  return visited;
}

export function buildFilteredLinks(resolvedLinks: RawLinks, filterSet: Set<string>): RawLinks {
  const filtered: RawLinks = {};
  for (const source in resolvedLinks) {
    if (!filterSet.has(source)) continue;
    for (const target in resolvedLinks[source]) {
      if (!filterSet.has(target)) continue;
      if (!filtered[source]) filtered[source] = {};
      filtered[source][target] = resolvedLinks[source][target] ?? 1;
    }
  }
  return filtered;
}