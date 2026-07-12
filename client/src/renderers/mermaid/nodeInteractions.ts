// v0.29 Sprint 63 (NF29 part 2): click-to-server-action routing and
// autonomous node-to-frame navigation extracted out of Mermaid.svelte.
// Behavior (listener attach/detach timing, click/edge payload shapes,
// node-to-frame's direct POST /seek bypassing the return channel) is
// unchanged — only the code's location moved. Popup *state* now lives in
// NodeActionPopup.svelte; this module only decides *whether* to request a
// popup (via onPopupRequest) or fire a plain click.

export interface PopupRequest {
  x: number;
  y: number;
  nodeId: string;
  nodeLabel: string;
  actions: string[];
}

export interface NodeInteractionsDeps {
  getContainer: () => HTMLDivElement | undefined;
  extractNodeId: (el: Element) => string | null;
  extractNodeLabel: (el: Element) => string;
  extractEdgeId: (el: Element) => string | null;
  getNodeActions: () => Record<string, string[]> | undefined;
  onPopupRequest: (popup: PopupRequest) => void;
}

export interface NodeInteractions {
  attachClickListeners(): void;
  detachClickListeners(): void;
  attachNodeToFrameListeners(map: Record<string, number>): void;
  detachNodeToFrameListeners(): void;
  /** Submits the user's popup menu selection for the given popup request. */
  selectAction(popup: PopupRequest, action: string): Promise<void>;
}

function stopPropagation(e: Event) {
  // Prevent wrapper's mousedown from starting a drag when clicking a node.
  e.stopPropagation();
}

async function postNodeClick(body: Record<string, unknown>) {
  await fetch("/node-click", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {
    /* server might not be listening */
  });
}

export function createNodeInteractions(deps: NodeInteractionsDeps): NodeInteractions {
  async function onNodeClick(e: Event) {
    e.stopPropagation();
    const el = (e.currentTarget as Element).closest(".node") ?? (e.currentTarget as Element);
    const id = deps.extractNodeId(el) ?? el.id;
    const label = deps.extractNodeLabel(el);

    // If this node has registered actions, request the popup menu.
    const actions = deps.getNodeActions()?.[id];
    if (actions && actions.length > 0) {
      const me = e as MouseEvent;
      deps.onPopupRequest({ x: me.clientX, y: me.clientY, nodeId: id, nodeLabel: label, actions });
      return;
    }

    // Plain click — no popup.
    await postNodeClick({ type: "node", id, label });
  }

  async function onEdgeClick(e: Event) {
    e.stopPropagation();
    const el = e.currentTarget as Element;
    const id = deps.extractEdgeId(el) ?? "";
    const label = el.textContent?.trim() ?? "";
    // Edge clicks are always plain (no popup).
    await postNodeClick({ type: "edge", id, label });
  }

  let clickCleanup: (() => void) | null = null;

  function attachClickListeners() {
    detachClickListeners();
    const container = deps.getContainer();
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;

    const nodes = svg.querySelectorAll<Element>(".node");
    const edgeLabels = svg.querySelectorAll<Element>(".edgeLabel");

    for (const node of nodes) {
      node.addEventListener("click", onNodeClick);
      node.addEventListener("mousedown", stopPropagation);
      (node as HTMLElement).style.cursor = "pointer";
      node.classList.add("clickable-node");
    }
    for (const edge of edgeLabels) {
      edge.addEventListener("click", onEdgeClick);
      edge.addEventListener("mousedown", stopPropagation);
      (edge as HTMLElement).style.cursor = "pointer";
    }

    clickCleanup = () => {
      for (const node of nodes) {
        node.removeEventListener("click", onNodeClick);
        node.removeEventListener("mousedown", stopPropagation);
        (node as HTMLElement).style.cursor = "";
        node.classList.remove("clickable-node");
      }
      for (const edge of edgeLabels) {
        edge.removeEventListener("click", onEdgeClick);
        edge.removeEventListener("mousedown", stopPropagation);
        (edge as HTMLElement).style.cursor = "";
      }
    };
  }

  function detachClickListeners() {
    clickCleanup?.();
    clickCleanup = null;
  }

  let ntfCleanup: (() => void) | null = null;

  function attachNodeToFrameListeners(map: Record<string, number>) {
    detachNodeToFrameListeners();
    const container = deps.getContainer();
    if (!container) return;
    const svg = container.querySelector("svg");
    if (!svg) return;

    const nodes = svg.querySelectorAll<HTMLElement>(".node");
    for (const node of nodes) {
      const id = deps.extractNodeId(node);
      if (id === null || !(id in map)) continue;
      const targetFrame = map[id];
      const handler = (e: Event) => {
        e.stopPropagation();
        fetch("/seek", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ frame: targetFrame }),
        }).catch(() => {
          /* no-op */
        });
      };
      node.addEventListener("click", handler);
      node.addEventListener("mousedown", stopPropagation);
      node.style.cursor = "pointer";
      ntfCleanup = ((prev) => () => {
        prev?.();
        node.removeEventListener("click", handler);
        node.removeEventListener("mousedown", stopPropagation);
        node.style.cursor = "";
      })(ntfCleanup);
    }
  }

  function detachNodeToFrameListeners() {
    ntfCleanup?.();
    ntfCleanup = null;
  }

  async function selectAction(popup: PopupRequest, action: string) {
    await postNodeClick({ type: "node", id: popup.nodeId, label: popup.nodeLabel, action });
  }

  return {
    attachClickListeners,
    detachClickListeners,
    attachNodeToFrameListeners,
    detachNodeToFrameListeners,
    selectAction,
  };
}
