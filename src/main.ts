import { Plugin, WorkspaceLeaf } from 'obsidian';
import { RootView, ROOT_VIEW_TYPE } from './view';

export default class RootViewPlugin extends Plugin {
  async onload() {
    console.log('Root View: Plugin geladen');

    this.registerView(
      ROOT_VIEW_TYPE,
      (leaf: WorkspaceLeaf) => new RootView(leaf)
    );

    this.addRibbonIcon('view', 'Root View öffnen', () => {
      this.activateView();
    });

    this.app.workspace.onLayoutReady(() => {
      const resolvedLinks = this.app.metadataCache.resolvedLinks;
      console.log('Root View: resolvedLinks', resolvedLinks);
    });
  }

  async activateView() {
	const { workspace } = this.app;
	const existing = workspace.getLeavesOfType(ROOT_VIEW_TYPE);

	let leaf: WorkspaceLeaf;

	const firstExisting = existing[0];
	if (firstExisting) {
		leaf = firstExisting;
	} else {
		const newLeaf = workspace.getLeaf('tab');
		if (!newLeaf) return;
		leaf = newLeaf;
		await leaf.setViewState({ type: ROOT_VIEW_TYPE, active: true });
	}

	workspace.revealLeaf(leaf);
	}

  onunload() {}
}