import { Plugin, WorkspaceLeaf, TFile } from 'obsidian';
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

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') return;
        menu.addItem((item) => {
          item
            .setTitle('Root View für diese Notiz')
            .setIcon('waypoints')
            .onClick(() => {
              this.openRootViewFiltered(file.path);
            });
        });
      })
    );

    this.addCommand({
      id: 'open-root-view-for-current-note',
      name: 'Root View für aktuelle Notiz öffnen',
      checkCallback: (checking: boolean) => {
        const activeFile = this.app.workspace.getActiveFile();
        if (!activeFile) return false;

        if (!checking) {
          this.openRootViewFiltered(activeFile.path);
        }
        return true;
      },
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

  async openRootViewFiltered(notePath: string) {
    const { workspace } = this.app;
    let leaf: WorkspaceLeaf;

    const existing = workspace.getLeavesOfType(ROOT_VIEW_TYPE);
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

    const view = leaf.view as RootView;
    await view.openFilteredForNote(notePath);
  }

  onunload() {}
}