import { ItemView, WorkspaceLeaf } from 'obsidian';
import * as d3 from 'd3';
import {
  computeReachability,
  computeCoreNodes,
  computeClusterHubs,
  findStronglyConnectedComponents,
  markCyclicLinks,
  buildReverseLinks,
  getAncestors,
  getDescendants,
  RawLinks,
  buildFilteredLinks,
} from './graph-utils';

export const ROOT_VIEW_TYPE = 'root-view';

interface GraphNode extends d3.SimulationNodeDatum {
  id: string;
  reach: number;
  isCore: boolean;
  isHub: boolean;
}

interface GraphLink extends d3.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

interface PreparedData {
  resolvedLinks: RawLinks;
  reverseLinks: RawLinks;
  allNodeIds: string[];
  reachability: Map<string, number>;
  coreNodes: Set<string>;
  clusterHubs: Set<string>;
  topNodeId: string | null;
}

export class RootView extends ItemView {
  private prepared: PreparedData | null = null;
  private currentCleanup: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType() {
    return ROOT_VIEW_TYPE;
  }

  getDisplayText() {
    return 'Root View';
  }

  getIcon() {
    return 'view';
  }

  async onOpen() {
    const container = this.containerEl.children[1] as HTMLElement;
    if (!container) return;
    container.empty();

    this.prepared = this.prepareData();
    this.showStartScreen(container);
  }

  prepareData(): PreparedData {
    const resolvedLinks = this.app.metadataCache.resolvedLinks;
    const reverseLinks = buildReverseLinks(resolvedLinks);

    const nodeIdSet = new Set<string>();
    for (const source in resolvedLinks) {
      nodeIdSet.add(source);
      for (const target in resolvedLinks[source]) {
        nodeIdSet.add(target);
      }
    }
    const allNodeIds = Array.from(nodeIdSet);

    const reachability = computeReachability(resolvedLinks, allNodeIds);

    let topNodeId: string | null = null;
    let topReach = -1;
    for (const [id, reach] of reachability.entries()) {
      if (reach > topReach) {
        topReach = reach;
        topNodeId = id;
      }
    }

    const coreNodes = computeCoreNodes(reachability, { relativeThreshold: 0.15, maxCoreNodes: 15 });
    const clusterHubs = computeClusterHubs(resolvedLinks, allNodeIds, { minDirectLinks: 3, maxHubs: 80 });

    return { resolvedLinks, reverseLinks, allNodeIds, reachability, coreNodes, clusterHubs, topNodeId };
  }

  showStartScreen(container: HTMLElement) {
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }
    container.empty();

    const wrapper = container.createEl('div');
    wrapper.style.cssText = 'padding: 20px;';

    wrapper.createEl('h3', { text: 'Root View' });

    const fullBtn = wrapper.createEl('button', { text: `Gesamten Graph laden (${this.prepared!.allNodeIds.length} Notizen)` });
    fullBtn.style.cssText = 'display: block; margin-bottom: 12px; padding: 8px 12px;';
    fullBtn.addEventListener('click', () => {
      const allIds = new Set(this.prepared!.allNodeIds);
      this.startFilteredRender(container, allIds);
    });

    wrapper.createEl('div', { text: 'Oder direkt gefiltert starten:' }).style.cssText = 'margin-bottom: 6px; opacity: 0.8;';

    const filterStartInput = wrapper.createEl('input', {
      type: 'text',
      placeholder: 'Notiz suchen...',
    });
    filterStartInput.style.cssText = 'padding: 6px; width: 250px;';

    const resultsList = wrapper.createEl('div');
    resultsList.style.cssText = 'margin-top: 6px; max-height: 300px; overflow-y: auto; width: 260px;';

    const getDisplayName = (id: string) => {
      const withoutExt = id.replace('.md', '');
      const parts = withoutExt.split('/');
      return parts[parts.length - 1] ?? withoutExt;
    };

    filterStartInput.addEventListener('input', () => {
      const query = filterStartInput.value.toLowerCase().trim();
      resultsList.innerHTML = '';
      if (!query) return;

      const matches = this.prepared!.allNodeIds
        .filter(id => getDisplayName(id).toLowerCase().includes(query))
        .slice(0, 30);

      matches.forEach(id => {
        const item = resultsList.createEl('div');
        item.textContent = getDisplayName(id);
        item.style.cssText = 'padding: 6px 8px; cursor: pointer; border-bottom: 1px solid #333;';
        item.addEventListener('mouseenter', () => { item.style.background = '#333'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', () => {
          const { resolvedLinks, reverseLinks } = this.prepared!;
          const ancestors = getAncestors(reverseLinks, id);
          const descendants = getDescendants(resolvedLinks, id);
          const combined = new Set([...ancestors, ...descendants]);
          this.startFilteredRender(container, combined);
        });
      });
    });
  }

  startFilteredRender(container: HTMLElement, nodeIdFilter: Set<string>) {
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }
    container.empty();

    const backBtn = container.createEl('button', { text: '← Zurück zur Auswahl' });
    backBtn.style.cssText = 'position: absolute; top: 10px; right: 10px; z-index: 20; padding: 6px 10px;';
    backBtn.addEventListener('click', () => {
      this.showStartScreen(container);
    });

    const searchWrapper = container.createEl('div');
    searchWrapper.style.cssText = 'position: absolute; top: 10px; left: 10px; z-index: 10; width: 200px;';

    const searchInput = searchWrapper.createEl('input', {
      type: 'text',
      placeholder: 'Notiz suchen...',
    });
    searchInput.style.cssText = 'width: 100%; padding: 6px 28px 6px 6px; box-sizing: border-box;';

    const searchClearBtn = searchWrapper.createEl('span', { text: '×' });
    searchClearBtn.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #999; font-size: 16px; display: none;';

    const searchResultsList = container.createEl('div');
    searchResultsList.style.cssText = 'position: absolute; top: 44px; left: 10px; z-index: 10; width: 220px; max-height: 300px; overflow-y: auto; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; display: none;';

    const filterWrapper = container.createEl('div');
    filterWrapper.style.cssText = 'position: absolute; top: 10px; left: 230px; z-index: 10; width: 220px;';

    const filterInput = filterWrapper.createEl('input', {
      type: 'text',
      placeholder: 'Knoten filtern (Vorfahren + Nachkommen)...',
    });
    filterInput.style.cssText = 'width: 100%; padding: 6px 28px 6px 6px; box-sizing: border-box;';

    const filterClearBtn = filterWrapper.createEl('span', { text: '×' });
    filterClearBtn.style.cssText = 'position: absolute; right: 8px; top: 50%; transform: translateY(-50%); cursor: pointer; color: #999; font-size: 16px; display: none;';

    const filterResultsList = container.createEl('div');
    filterResultsList.style.cssText = 'position: absolute; top: 44px; left: 230px; z-index: 10; width: 220px; max-height: 300px; overflow-y: auto; background: #1e1e1e; border: 1px solid #444; border-radius: 4px; display: none;';

    this.currentCleanup = this.renderGraph(
      container, nodeIdFilter,
      searchInput, searchResultsList, searchClearBtn,
      filterInput, filterResultsList, filterClearBtn
    );
  }

  renderGraph(
    container: HTMLElement,
    nodeIdFilter: Set<string>,
    searchInput: HTMLInputElement,
    searchResultsList: HTMLElement,
    searchClearBtn: HTMLElement,
    filterInput: HTMLInputElement,
    filterResultsList: HTMLElement,
    filterClearBtn: HTMLElement
  ): () => void {
    const { resolvedLinks, reverseLinks, reachability, coreNodes, clusterHubs, topNodeId } = this.prepared!;

    const filteredLinksMap = buildFilteredLinks(resolvedLinks, nodeIdFilter);

    const links: GraphLink[] = [];
    for (const source in filteredLinksMap) {
      for (const target in filteredLinksMap[source]) {
        links.push({ source, target });
      }
    }

    const filteredIds = Array.from(nodeIdFilter);
    const maxReach = Math.max(1, ...filteredIds.map(id => reachability.get(id) ?? 0));

    const nodes: GraphNode[] = filteredIds.map(id => ({
      id,
      reach: reachability.get(id) ?? 0,
      isCore: coreNodes.has(id),
      isHub: clusterHubs.has(id),
    }));

    const coreAndHubNodes = nodes.filter(n => n.isCore || n.isHub);

    const width = container.clientWidth || 800;
    const height = container.clientHeight || 600;

    const coreArray = nodes.filter(n => n.isCore).sort((a, b) => b.reach - a.reach);
    const coreRadius = Math.max(200, coreArray.length * 40);

    const arrangedCore: GraphNode[] = new Array(coreArray.length);
    let left = 0;
    let right = coreArray.length - 1;
    coreArray.forEach((n, i) => {
      if (i % 2 === 0) {
        arrangedCore[left] = n;
        left += 2;
      } else {
        arrangedCore[right] = n;
        right -= 2;
      }
    });

    arrangedCore.forEach((n, i) => {
      const angle = (i / arrangedCore.length) * 2 * Math.PI;
      n.x = width / 2 + coreRadius * Math.cos(angle);
      n.y = height / 2 + coreRadius * Math.sin(angle);
    });

    const topNode = nodes.find(n => n.id === topNodeId);
    if (topNode) {
      topNode.fx = width / 2;
      topNode.fy = height / 2;
    }

    const radiusScale = d3.scaleSqrt()
      .domain([0, maxReach])
      .range([9, 30]);

    const svg = d3.select(container)
      .append('svg')
      .attr('width', width)
      .attr('height', height);

    svg.append('defs').append('marker')
      .attr('id', 'arrowhead')
      .attr('viewBox', '0 -5 10 10')
      .attr('refX', 9)
      .attr('refY', 0)
      .attr('markerWidth', 7)
      .attr('markerHeight', 7)
      .attr('orient', 'auto')
      .append('path')
      .attr('d', 'M0,-5L10,0L0,5')
      .attr('fill', '#ccc');

    const nodeToComponent = findStronglyConnectedComponents(filteredLinksMap, filteredIds);
    const cyclicLinkKeys = markCyclicLinks(
      links.map(l => ({ source: l.source as string, target: l.target as string })),
      nodeToComponent
    );

    const simulation = d3.forceSimulation(nodes)
      .alphaDecay(0.03)
      .force('link', d3.forceLink<GraphNode, GraphLink>(links)
        .id(d => d.id)
        .distance(50)
        .strength(0.4)
      )
      .force('charge', d3.forceManyBody<GraphNode>().strength(d => {
        if (d.isCore) return -1200;
        if (d.isHub) return -500;
        return -150;
      }))
      .force('collide', d3.forceCollide<GraphNode>(d => {
        if (d.isCore) return radiusScale(d.reach) + 120;
        if (d.isHub) return radiusScale(d.reach) + 40;
        return radiusScale(d.reach) + 6;
      }))
      .force('x', d3.forceX(width / 2).strength(0.01))
      .force('y', d3.forceY(height / 2).strength(0.01));

    const g = svg.append('g');

    let currentZoomScale = 1;

    function getNodeId(x: string | GraphNode): string {
      return typeof x === 'string' ? x : x.id;
    }

    function getDisplayName(id: string): string {
      const withoutExt = id.replace('.md', '');
      const parts = withoutExt.split('/');
      return parts[parts.length - 1] ?? withoutExt;
    }

    const link = g.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#aaa')
      .attr('stroke-opacity', 0.5)
      .attr('stroke-width', 2)
      .attr('stroke-dasharray', d => {
        const key = `${getNodeId(d.source)}→${getNodeId(d.target)}`;
        return cyclicLinkKeys.has(key) ? '4,3' : null;
      })
      .attr('marker-end', 'url(#arrowhead)');

    const node = g.append('g')
      .selectAll<SVGCircleElement, GraphNode>('circle')
      .data(nodes)
      .join('circle')
      .attr('r', d => radiusScale(d.reach))
      .attr('fill', d => d.isCore ? '#e07a5f' : d.isHub ? '#f2c14e' : '#69b3a2')
      .style('cursor', 'pointer');

    node.on('click', (event, d) => {
      const file = this.app.vault.getAbstractFileByPath(d.id);
      if (file) {
        this.app.workspace.getLeaf('tab').openFile(file as any);
      }
    });

    node.append('title')
      .text(d => `${getDisplayName(d.id)} (Reach: ${d.reach})`);

    let dragEndTimeouts: number[] = [];

    const drag = d3.drag<SVGCircleElement, GraphNode>()
      .on('start', (event, d) => {
        if (!event.active) simulation.alphaTarget(0.3).restart();
        d.fx = d.x;
        d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x;
        d.fy = event.y;
      })
      .on('end', (event, d) => {
        if (!event.active) simulation.alphaTarget(0);
        if (!d.isCore) {
          const t = window.setTimeout(() => {
            d.fx = null;
            d.fy = null;
          }, 500);
          dragEndTimeouts.push(t);
        }
      });

    node.call(drag);

    const label = g.append('g')
      .selectAll('text')
      .data(nodes)
      .join('text')
      .text(d => d.isCore ? `${getDisplayName(d.id)} (${d.reach})` : getDisplayName(d.id))
      .attr('font-size', d => d.isCore ? 15 : d.isHub ? 13 : 13)
      .attr('font-weight', d => (d.isCore || d.isHub) ? 'bold' : 'normal')
      .attr('fill', d => d.isHub && !d.isCore ? '#f2c14e' : '#fff')
      .attr('stroke', '#000')
      .attr('stroke-width', d => d.isCore ? 3 : d.isHub ? 2.5 : 1.5)
      .attr('paint-order', 'stroke')
      .style('pointer-events', 'none')
      .style('opacity', d => (d.isCore || d.isHub) ? 1 : 0);

    function updateLabelVisibility(scale: number) {
      label.style('opacity', d => {
        if (d.isCore || d.isHub) return 1;
        const threshold = d.reach > 0 ? 0.8 : 1.5;
        return scale >= threshold ? 1 : 0;
      });
    }

    function updateStableLabelScale(k: number) {
      label.filter(d => d.isCore || d.isHub)
        .attr('transform', function(d) {
          const el = this as SVGTextElement;
          const offsetX = parseFloat(el.getAttribute('data-offset-x') ?? '0');
          const offsetY = parseFloat(el.getAttribute('data-offset-y') ?? '0');
          const x = (d.x ?? 0) + 8 + offsetX;
          const y = (d.y ?? 0) + 4 + offsetY;
          return `translate(${x},${y}) scale(${1 / k}) translate(${-x},${-y})`;
        });
    }

    function resolveLabelCollisions() {
      const visibleLabels = label.filter(d => d.isCore || d.isHub).nodes();
      const positions = visibleLabels.map(el => {
        const bbox = (el as SVGTextElement).getBBox();
        const d = d3.select(el).datum() as GraphNode;
        return { el, d, x: d.x ?? 0, y: d.y ?? 0, width: bbox.width, height: bbox.height, offsetX: 0, offsetY: 0 };
      });

      const iterations = 100;
      const padding = 14;

      for (let iter = 0; iter < iterations; iter++) {
        for (let i = 0; i < positions.length; i++) {
          const a = positions[i];
          if (!a) continue;
          for (let j = i + 1; j < positions.length; j++) {
            const b = positions[j];
            if (!b) continue;

            const ax = a.x + a.offsetX;
            const ay = a.y + a.offsetY;
            const bx = b.x + b.offsetX;
            const by = b.y + b.offsetY;

            const dx = bx - ax;
            const dy = by - ay;
            const minDistX = (a.width + b.width) / 2 + padding;
            const minDistY = (a.height + b.height) / 2 + padding / 2;

            if (Math.abs(dx) < minDistX && Math.abs(dy) < minDistY) {
              const pushX = (minDistX - Math.abs(dx)) * (dx < 0 ? -1 : dx === 0 ? (Math.random() - 0.5) : 1);
              const pushY = (minDistY - Math.abs(dy)) * (dy < 0 ? -1 : dy === 0 ? (Math.random() - 0.5) : 1);
              a.offsetX -= pushX * 0.5;
              a.offsetY -= pushY * 0.5;
              b.offsetX += pushX * 0.5;
              b.offsetY += pushY * 0.5;
            }
          }
        }
      }

      positions.forEach(p => {
        d3.select(p.el)
          .attr('data-offset-x', p.offsetX)
          .attr('data-offset-y', p.offsetY);
      });
    }

    const anchorCache = new Map<string, GraphNode>();
    let tickCount = 0;

    function updateAnchorCache() {
      for (const n of nodes) {
        if (n.isCore || n.isHub) continue;
        let closest: GraphNode | null = null;
        let minDist = Infinity;
        for (const c of coreAndHubNodes) {
          const d = Math.hypot((n.x ?? 0) - (c.x ?? 0), (n.y ?? 0) - (c.y ?? 0));
          if (d < minDist) {
            minDist = d;
            closest = c;
            if (d < 5) break;
          }
        }
        if (closest) anchorCache.set(n.id, closest);
      }
    }

    function radialSpreadForce(alpha: number) {
      tickCount++;
      if (tickCount % 25 === 1) updateAnchorCache();

      for (const n of nodes) {
        if (n.isCore) continue;
        const anchor = anchorCache.get(n.id);
        if (!anchor) continue;

        const dx = (n.x ?? 0) - (anchor.x ?? 0);
        const dy = (n.y ?? 0) - (anchor.y ?? 0);
        const dist = Math.hypot(dx, dy) || 1;
        const strength = 0.02 * alpha;
        n.vx = (n.vx ?? 0) + (dx / dist) * strength;
        n.vy = (n.vy ?? 0) + (dy / dist) * strength;
      }
    }

    simulation.force('radialSpread', radialSpreadForce);

    const zoom = d3.zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.1, 4])
      .on('zoom', (event) => {
        g.attr('transform', event.transform);
        currentZoomScale = event.transform.k;
        updateLabelVisibility(currentZoomScale);
        updateStableLabelScale(currentZoomScale);
      });

    svg.call(zoom);

    updateStableLabelScale(1);

    simulation.on('tick', () => {
      link
        .attr('x1', d => typeof d.source === 'string' ? 0 : d.source.x!)
        .attr('y1', d => typeof d.source === 'string' ? 0 : d.source.y!)
        .attr('x2', d => {
          if (typeof d.target === 'string') return 0;
          const target = d.target as GraphNode;
          const source = d.source as GraphNode;
          const dx = target.x! - source.x!;
          const dy = target.y! - source.y!;
          const dist = Math.hypot(dx, dy) || 1;
          const r = radiusScale(target.reach) + 6;
          return target.x! - (dx / dist) * r;
        })
        .attr('y2', d => {
          if (typeof d.target === 'string') return 0;
          const target = d.target as GraphNode;
          const source = d.source as GraphNode;
          const dx = target.x! - source.x!;
          const dy = target.y! - source.y!;
          const dist = Math.hypot(dx, dy) || 1;
          const r = radiusScale(target.reach) + 6;
          return target.y! - (dy / dist) * r;
        });

      node
        .attr('cx', d => d.x!)
        .attr('cy', d => d.y!);

      label
        .attr('x', d => d.x! + 8)
        .attr('y', d => d.y! + 4);

      updateStableLabelScale(currentZoomScale);
    });

    simulation.on('end', () => {
      resolveLabelCollisions();
      updateStableLabelScale(currentZoomScale);
    });

    function focusOnNode(target: GraphNode) {
      node.attr('stroke', d => d.id === target.id ? '#ffeb3b' : null)
          .attr('stroke-width', d => d.id === target.id ? 3 : null);

      if (target.x !== undefined && target.y !== undefined) {
        const scale = 2;
        const transform = d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(scale)
          .translate(-target.x, -target.y);

        svg.transition().duration(500).call(zoom.transform, transform);
      }
    }

    searchInput.addEventListener('input', () => {
      searchClearBtn.style.display = searchInput.value.trim() ? 'block' : 'none';

      const query = searchInput.value.toLowerCase().trim();
      searchResultsList.innerHTML = '';

      if (!query) {
        searchResultsList.style.display = 'none';
        node.attr('stroke', null);
        return;
      }

      const matches = nodes
        .filter(n => getDisplayName(n.id).toLowerCase().includes(query))
        .slice(0, 30);

      if (matches.length === 0) {
        searchResultsList.style.display = 'none';
        return;
      }

      searchResultsList.style.display = 'block';
      matches.forEach(m => {
        const item = searchResultsList.createEl('div');
        item.textContent = `${getDisplayName(m.id)}${m.isCore || m.isHub ? ` (${m.reach})` : ''}`;
        item.style.cssText = 'padding: 6px 8px; cursor: pointer; color: #ddd; font-size: 12px;';
        item.addEventListener('mouseenter', () => { item.style.background = '#333'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', () => {
          focusOnNode(m);
          searchResultsList.style.display = 'none';
        });
      });
    });

    filterInput.addEventListener('input', () => {
      filterClearBtn.style.display = filterInput.value.trim() ? 'block' : 'none';

      const query = filterInput.value.toLowerCase().trim();
      filterResultsList.innerHTML = '';

      if (!query) {
        filterResultsList.style.display = 'none';
        return;
      }

      // Gegen ALLE Notizen suchen, nicht nur die aktuell geladene Teilmenge
      const matches = this.prepared!.allNodeIds
        .filter(id => getDisplayName(id).toLowerCase().includes(query))
        .slice(0, 30);

      if (matches.length === 0) {
        filterResultsList.style.display = 'none';
        return;
      }

      filterResultsList.style.display = 'block';
      matches.forEach(id => {
        const item = filterResultsList.createEl('div');
        item.textContent = getDisplayName(id);
        item.style.cssText = 'padding: 6px 8px; cursor: pointer; color: #ddd; font-size: 12px;';
        item.addEventListener('mouseenter', () => { item.style.background = '#333'; });
        item.addEventListener('mouseleave', () => { item.style.background = 'transparent'; });
        item.addEventListener('click', () => {
          const ancestors = getAncestors(reverseLinks, id);
          const descendants = getDescendants(resolvedLinks, id);
          const combined = new Set([...ancestors, ...descendants]);
          filterResultsList.style.display = 'none';
          // Komplett neu rendern mit der neuen Teilmenge, statt nur umzuschalten
          this.startFilteredRender(container, combined);
        });
      });
    });

    searchClearBtn.addEventListener('click', () => {
      searchInput.value = '';
      searchInput.dispatchEvent(new Event('input'));
      searchClearBtn.style.display = 'none';
    });

    filterClearBtn.addEventListener('click', () => {
      filterInput.value = '';
      filterClearBtn.style.display = 'none';
      filterResultsList.style.display = 'none';
      filterResultsList.innerHTML = '';
    });

    return () => {
      dragEndTimeouts.forEach(t => window.clearTimeout(t));
      simulation.stop();
      svg.remove();
    };
  }

  async onClose() {
    if (this.currentCleanup) {
      this.currentCleanup();
      this.currentCleanup = null;
    }
  }
}