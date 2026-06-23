const STORAGE_KEY = "family-tree-maker-data";

const DEFAULT_DATA = {
  people: {
    root: {
      id: "root",
      givenName: "Your",
      surname: "Name",
      birthSurname: "",
      gender: "unknown",
      color: "",
      birthDate: "",
      deathDate: "",
      birthPlace: "",
      profession: "",
      email: "",
      phone: "",
      photo: "",
      bio: "",
      parents: [],
      partners: [],
      children: []
    }
  },
  selectedId: "root",
  focusId: "root",
  zoom: 1,
  depth: "compact",
  moveMode: false,
  nodePositions: {},
  viewport: { left: 0, top: 0 }
};

const state = loadState();
const els = {};
let currentLayout = null;

const FAMILY_LINE_COLORS = [
  "#2f7d62",
  "#b65c71",
  "#537ea6",
  "#c28b32",
  "#7b61b8",
  "#d06f3c",
  "#27838f",
  "#8b6f47",
  "#9a4f84",
  "#5f7f3b"
];

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  render();
  requestAnimationFrame(() => {
    if (!restoreViewportPosition()) {
      centerSelected();
    }
  });
});

function bindElements() {
  [
    "saveStatus",
    "newTreeBtn",
    "importBtn",
    "exportBtn",
    "printBtn",
    "photoPreview",
    "avatarFallback",
    "selectedName",
    "selectedMeta",
    "personForm",
    "existingPersonSelect",
    "connectPartnerBtn",
    "connectParentBtn",
    "connectChildBtn",
    "relationshipList",
    "deletePersonBtn",
    "searchInput",
    "searchResults",
    "zoomOutBtn",
    "zoomResetBtn",
    "zoomInBtn",
    "fullscreenBtn",
    "imageExportBtn",
    "moveNodesBtn",
    "resetLayoutBtn",
    "treeViewport",
    "relationshipLines",
    "treeCanvas",
    "fileInput",
    "toast"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
  els.treeArea = document.querySelector(".tree-area");
}

function bindEvents() {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => setActiveTab(tab.dataset.tab));
  });

  els.personForm.addEventListener("input", handleFormInput);

  document.querySelectorAll(".relationship-actions button[data-action]").forEach((button) => {
    button.addEventListener("click", () => addRelative(button.dataset.action));
  });

  els.existingPersonSelect.addEventListener("change", updateExistingRelationshipButtons);
  els.connectPartnerBtn.addEventListener("click", () => connectExistingPerson("partner"));
  els.connectParentBtn.addEventListener("click", () => connectExistingPerson("parent"));
  els.connectChildBtn.addEventListener("click", () => connectExistingPerson("child"));
  els.deletePersonBtn.addEventListener("click", deleteSelectedPerson);
  els.newTreeBtn.addEventListener("click", newTree);
  els.exportBtn.addEventListener("click", exportJson);
  els.importBtn.addEventListener("click", () => els.fileInput.click());
  els.fileInput.addEventListener("change", importFile);
  els.printBtn.addEventListener("click", () => window.print());

  els.searchInput.addEventListener("input", renderSearch);
  document.addEventListener("click", (event) => {
    if (!event.target.closest(".search-wrap")) {
      els.searchResults.classList.add("hidden");
    }
  });

  els.zoomOutBtn.addEventListener("click", () => setZoom(state.zoom - 0.1));
  els.zoomInBtn.addEventListener("click", () => setZoom(state.zoom + 0.1));
  els.zoomResetBtn.addEventListener("click", () => setZoom(1));
  els.fullscreenBtn.addEventListener("click", toggleFullscreen);
  els.imageExportBtn.addEventListener("click", exportTreeImage);
  els.moveNodesBtn.addEventListener("click", toggleMoveMode);
  els.resetLayoutBtn.addEventListener("click", resetMovedNodes);
  els.treeViewport.addEventListener("scroll", rememberViewportPosition, { passive: true });
  document.addEventListener("fullscreenchange", updateFullscreenButton);

  document.querySelectorAll("[data-depth]").forEach((button) => {
    button.addEventListener("click", () => {
      state.depth = button.dataset.depth;
      saveState();
      renderTree();
    });
  });
}

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.people && Object.keys(saved.people).length) {
      return normalizeState(saved);
    }
  } catch (error) {
    console.warn("Unable to load saved tree", error);
  }
  return clone(DEFAULT_DATA);
}

function normalizeState(data) {
  const normalized = {
    people: {},
    selectedId: data.selectedId || data.focusId || Object.keys(data.people)[0],
    focusId: data.focusId || data.selectedId || Object.keys(data.people)[0],
    zoom: Number(data.zoom) || 1,
    depth: data.depth === "full" ? "full" : "compact",
    moveMode: Boolean(data.moveMode),
    nodePositions: normalizeNodePositions(data.nodePositions),
    viewport: normalizeViewport(data.viewport)
  };

  Object.values(data.people).forEach((person) => {
    normalized.people[person.id] = {
      id: person.id,
      givenName: person.givenName || "",
      surname: person.surname || "",
      birthSurname: person.birthSurname || "",
      gender: person.gender || "unknown",
      color: "",
      birthDate: person.birthDate || "",
      deathDate: person.deathDate || "",
      birthPlace: person.birthPlace || "",
      profession: person.profession || "",
      email: person.email || "",
      phone: person.phone || "",
      photo: person.photo || "",
      bio: person.bio || "",
      parents: uniqueIds(person.parents),
      partners: uniqueIds(person.partners),
      children: uniqueIds(person.children)
    };
  });

  if (!normalized.people[normalized.selectedId]) {
    normalized.selectedId = Object.keys(normalized.people)[0];
  }
  if (!normalized.people[normalized.focusId]) {
    normalized.focusId = normalized.selectedId;
  }
  return normalized;
}

function saveState() {
  captureViewportPosition();
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  els.saveStatus.textContent = "Saved locally";
}

function markDirty() {
  els.saveStatus.textContent = "Saving...";
  window.clearTimeout(markDirty.timer);
  markDirty.timer = window.setTimeout(saveState, 150);
}

function render() {
  renderEditor();
  renderExistingPersonOptions();
  renderRelationshipList();
  renderTree();
  renderSearch();
}

function renderEditor() {
  const person = selectedPerson();
  if (!person) return;

  els.selectedName.textContent = displayName(person);
  els.selectedMeta.textContent = metaLine(person) || "Add details to begin.";
  els.avatarFallback.textContent = initials(person);
  els.avatarFallback.style.background = colorForPerson(person);

  if (person.photo) {
    els.photoPreview.src = person.photo;
    els.photoPreview.classList.remove("hidden");
    els.avatarFallback.classList.add("hidden");
  } else {
    els.photoPreview.removeAttribute("src");
    els.photoPreview.classList.add("hidden");
    els.avatarFallback.classList.remove("hidden");
  }

  Array.from(els.personForm.elements).forEach((field) => {
    if (field.name && Object.hasOwn(person, field.name)) {
      field.value = person[field.name];
    }
  });
}

function renderExistingPersonOptions() {
  const selected = selectedPerson();
  const options = Object.values(state.people)
    .filter((person) => person.id !== selected?.id)
    .sort((a, b) => displayName(a).localeCompare(displayName(b)));

  const currentValue = els.existingPersonSelect.value;
  els.existingPersonSelect.innerHTML = options.length
    ? options
        .map((person) => `<option value="${escapeAttribute(person.id)}">${escapeHtml(displayName(person))}</option>`)
        .join("")
    : `<option value="">No other people yet</option>`;

  if (options.some((person) => person.id === currentValue)) {
    els.existingPersonSelect.value = currentValue;
  }
  updateExistingRelationshipButtons();
}

function renderTree() {
  els.treeCanvas.innerHTML = "";
  els.relationshipLines.innerHTML = "";

  document.querySelectorAll("[data-depth]").forEach((button) => {
    button.classList.toggle("active", button.dataset.depth === state.depth);
  });

  const people = Object.values(state.people);
  if (!people.length) {
    renderEmptyState();
    return;
  }

  const layout = buildLayout();
  currentLayout = layout;
  const bounds = layoutBounds(layout.nodes);
  const width = Math.max(1300, bounds.maxX + 280);
  const height = Math.max(900, bounds.maxY + 180);
  els.treeCanvas.style.width = `${width}px`;
  els.treeCanvas.style.height = `${height}px`;
  els.relationshipLines.setAttribute("width", width);
  els.relationshipLines.setAttribute("height", height);
  els.relationshipLines.style.width = `${width}px`;
  els.relationshipLines.style.height = `${height}px`;
  els.treeCanvas.style.transform = `scale(${state.zoom})`;
  els.relationshipLines.style.transform = `scale(${state.zoom})`;
  els.relationshipLines.style.transformOrigin = "top left";

  drawRelationshipLines(layout);
  layout.nodes.forEach(renderPersonCard);
  updateMoveModeButton();
}

function renderEmptyState() {
  const empty = document.createElement("div");
  empty.className = "empty-state";
  empty.innerHTML = `
    <h2>Start your tree</h2>
    <p>Add your first person, then connect parents, partners, children, and siblings as your research grows.</p>
    <button type="button">Create first person</button>
  `;
  empty.querySelector("button").addEventListener("click", () => {
    const id = createPerson({ givenName: "New", surname: "Person" });
    state.selectedId = id;
    state.focusId = id;
    markDirty();
    render();
  });
  els.treeCanvas.appendChild(empty);
}

function buildLayout() {
  const focus = state.people[state.focusId] || selectedPerson();
  const maxAncestorDepth = state.depth === "full" ? 99 : 3;
  const maxDescendantDepth = state.depth === "full" ? 99 : 4;
  const generationById = assignGenerations(focus.id, maxAncestorDepth, maxDescendantDepth);

  if (state.depth === "full") {
    Object.keys(state.people).forEach((id) => {
      if (!generationById.has(id)) {
        generationById.set(id, nextOpenGeneration(generationById));
      }
    });
  }

  const levels = new Map();
  generationById.forEach((level, id) => {
    if (!levels.has(level)) levels.set(level, []);
    levels.get(level).push(id);
  });

  const levelKeys = [...levels.keys()].sort((a, b) => a - b);
  const nodeMap = new Map();
  const nodes = [];
  const cardWidth = 178;
  const cardMidX = cardWidth / 2;
  const cardHeight = 84;
  const levelGap = 250;
  const partnerGap = 18;
  const groupGap = 150;
  const leftPad = 110;
  const startY = 90 + Math.abs(Math.min(...levelKeys, 0)) * levelGap;

  levelKeys.forEach((level) => {
    const groups = buildGenerationGroups(levels.get(level), generationById).map((ids) => ({
      ids,
      level,
      width: ids.length * cardWidth + (ids.length - 1) * partnerGap,
      preferredCenter: null,
      x: 0,
      center: 0
    }));

    groups.sort((a, b) => groupSortValue(a.ids, nodeMap) - groupSortValue(b.ids, nodeMap));

    const y = startY + level * levelGap;
    placeGenerationGroups(groups, nodeMap, cardMidX, cardWidth, groupGap, leftPad);

    groups.forEach((group) => {
      group.ids.forEach((id, index) => {
        const node = {
          id,
          person: state.people[id],
          x: group.x + index * (cardWidth + partnerGap),
          y
        };
        nodeMap.set(id, node);
        nodes.push(node);
      });
    });
  });

  const bounds = layoutBounds(nodes);
  const layoutWidth = bounds.maxX + cardWidth - Math.min(...nodes.map((node) => node.x));
  const globalOffset = Math.max(leftPad - Math.min(...nodes.map((node) => node.x)), (980 - layoutWidth) / 2);
  nodes.forEach((node) => {
    node.x += globalOffset;
  });

  nodes.forEach((node) => {
    const position = state.nodePositions[node.id];
    if (position) {
      node.x = position.x;
      node.y = position.y;
    }
  });

  const links = [];
  const partnerLinks = [];
  const linkedChildren = new Set();
  nodes.forEach((node) => {
    const visibleParents = node.person.parents.map((id) => nodeMap.get(id)).filter(Boolean);
    if (visibleParents.length && !linkedChildren.has(node.id)) {
      const parentCenterX = visibleParents.reduce((sum, parent) => sum + parent.x + cardMidX, 0) / visibleParents.length;
      const parentBottomY = Math.max(...visibleParents.map((parent) => parent.y + cardHeight));
      const familyKey = familyKeyForParents(visibleParents);
      links.push({
        fromX: parentCenterX,
        fromY: parentBottomY,
        parents: visibleParents,
        to: node,
        familyKey,
        color: colorForFamilyKey(familyKey)
      });
      linkedChildren.add(node.id);
    }
    node.person.partners.forEach((partnerId) => {
      const partner = nodeMap.get(partnerId);
      if (partner && node.id < partner.id) {
        const familyKey = familyKeyForParents([node, partner]);
        partnerLinks.push({ from: node, to: partner, familyKey, color: colorForFamilyKey(familyKey) });
      }
    });
  });

  return { nodes, links, partnerLinks };
}

function assignGenerations(focusId, maxAncestorDepth, maxDescendantDepth) {
  const generations = new Map([[focusId, 0]]);
  const queue = [focusId];

  while (queue.length) {
    const id = queue.shift();
    const person = state.people[id];
    const generation = generations.get(id);
    if (!person) continue;

    person.partners.forEach((partnerId) => setGeneration(partnerId, generation));

    if (Math.abs(generation - 1) <= maxAncestorDepth) {
      person.parents.forEach((parentId) => setGeneration(parentId, generation - 1));
    }

    if (generation + 1 <= maxDescendantDepth) {
      person.children.forEach((childId) => setGeneration(childId, generation + 1));
    }
  }

  return generations;

  function setGeneration(id, generation) {
    if (!state.people[id] || generations.has(id)) return;
    generations.set(id, generation);
    queue.push(id);
  }
}

function buildGenerationGroups(ids, generationById) {
  const remaining = new Set(ids);
  const groups = [];

  ids.forEach((id) => {
    if (!remaining.has(id)) return;
    const group = [];
    const stack = [id];
    remaining.delete(id);

    while (stack.length) {
      const currentId = stack.pop();
      const current = state.people[currentId];
      group.push(currentId);
      current.partners.forEach((partnerId) => {
        if (remaining.has(partnerId) && generationById.get(partnerId) === generationById.get(currentId)) {
          remaining.delete(partnerId);
          stack.push(partnerId);
        }
      });
    }

    groups.push(orderPartnerGroup(group));
  });

  return mergeSiblingGroups(groups);
}

function mergeSiblingGroups(groups) {
  const merged = [];
  const byParentKey = new Map();

  groups.forEach((group) => {
    const key = parentKeyForGroup(group);
    if (!key) {
      merged.push(group);
      return;
    }
    if (!byParentKey.has(key)) {
      const siblingGroup = [];
      byParentKey.set(key, siblingGroup);
      merged.push(siblingGroup);
    }
    byParentKey.get(key).push(...group);
  });

  return merged.map((group) => orderPartnerGroup(uniqueIds(group)));
}

function parentKeyForGroup(group) {
  const keys = uniqueIds(
    group
      .map((id) => state.people[id])
      .filter(Boolean)
      .map((person) => person.parents.slice().sort().join("|"))
      .filter(Boolean)
  );
  return keys.length === 1 ? keys[0] : "";
}

function orderPartnerGroup(group) {
  if (group.length <= 2) return group;
  const ordered = [];
  const remaining = new Set(group);
  const seed = group.includes(state.focusId) ? state.focusId : group.includes(state.selectedId) ? state.selectedId : group[0];
  ordered.push(seed);
  remaining.delete(seed);

  while (remaining.size) {
    const last = ordered.at(-1);
    const nextPartner = state.people[last].partners.find((id) => remaining.has(id));
    const next = nextPartner || [...remaining][0];
    ordered.push(next);
    remaining.delete(next);
  }

  return ordered;
}

function groupSortValue(group, nodeMap) {
  const parentCenters = group.flatMap((id) => {
    return state.people[id].parents
      .map((parentId) => nodeMap.get(parentId))
      .filter(Boolean)
      .map((parent) => parent.x + 89);
  });
  if (parentCenters.length) {
    return parentCenters.reduce((sum, value) => sum + value, 0) / parentCenters.length;
  }
  if (group.includes(state.focusId)) return -2;
  if (group.includes(state.selectedId)) return -1;
  return group.map((id) => displayName(state.people[id]).toLowerCase()).sort()[0].charCodeAt(0) || 0;
}

function placeGenerationGroups(groups, nodeMap, cardMidX, cardWidth, groupGap, leftPad) {
  let fallbackCenter = leftPad + cardWidth / 2;
  groups.forEach((group) => {
    group.preferredCenter = preferredFamilyCenter(group.ids, nodeMap, cardMidX);
    if (group.preferredCenter === null) {
      group.preferredCenter = fallbackCenter + group.width / 2 - cardWidth / 2;
      fallbackCenter = group.preferredCenter + group.width / 2 + groupGap;
    }
    group.x = group.preferredCenter - group.width / 2;
    group.center = group.preferredCenter;
  });

  resolveGroupOverlaps(groups, groupGap);

  const minX = Math.min(...groups.map((group) => group.x));
  if (minX < leftPad) {
    shiftGroups(groups, leftPad - minX);
  }

  for (let pass = 0; pass < 3; pass += 1) {
    pullGroupsTowardPreferredCenters(groups, groupGap);
    resolveGroupOverlaps(groups, groupGap);
  }
}

function resolveGroupOverlaps(groups, groupGap) {
  groups.sort((a, b) => a.x - b.x);
  for (let index = 1; index < groups.length; index += 1) {
    const previous = groups[index - 1];
    const group = groups[index];
    const minX = previous.x + previous.width + groupGap;
    if (group.x < minX) {
      group.x = minX;
      group.center = group.x + group.width / 2;
    }
  }
}

function pullGroupsTowardPreferredCenters(groups, groupGap) {
  groups.forEach((group, index) => {
    const preferredX = group.preferredCenter - group.width / 2;
    let minX = -Infinity;
    let maxX = Infinity;
    if (groups[index - 1]) {
      minX = groups[index - 1].x + groups[index - 1].width + groupGap;
    }
    if (groups[index + 1]) {
      maxX = groups[index + 1].x - group.width - groupGap;
    }
    group.x = Math.min(maxX, Math.max(minX, preferredX));
    group.center = group.x + group.width / 2;
  });
}

function shiftGroups(groups, amount) {
  groups.forEach((group) => {
    group.x += amount;
    group.center += amount;
    group.preferredCenter += amount;
  });
}

function preferredFamilyCenter(group, nodeMap, cardMidX) {
  const parentCenters = group.flatMap((id) => {
    return state.people[id].parents
      .map((parentId) => nodeMap.get(parentId))
      .filter(Boolean)
      .map((parent) => parent.x + cardMidX);
  });
  if (!parentCenters.length) return null;
  return parentCenters.reduce((sum, value) => sum + value, 0) / parentCenters.length;
}

function nextOpenGeneration(generationById) {
  const existing = new Set(generationById.values());
  let generation = 1;
  while (existing.has(generation)) {
    generation += 1;
  }
  return generation;
}

function renderPersonCard(node) {
  const button = document.createElement("button");
  const person = node.person;
  button.className = "person-card";
  button.classList.toggle("selected", person.id === state.selectedId);
  button.style.left = `${node.x}px`;
  button.style.top = `${node.y}px`;
  button.style.setProperty("--person-color", colorForPerson(person));
  button.draggable = false;
  button.type = "button";
  button.innerHTML = `
    <span class="mini-avatar" style="background:${escapeHtml(colorForPerson(person))}">
      ${person.photo ? `<img src="${escapeAttribute(person.photo)}" alt="">` : escapeHtml(initials(person))}
    </span>
    <span>
      <strong>${escapeHtml(displayName(person))}</strong>
      <span>${escapeHtml(metaLine(person) || relationshipCount(person))}</span>
    </span>
  `;
  button.addEventListener("click", () => {
    if (button.dataset.dragged === "true") {
      button.dataset.dragged = "false";
      return;
    }
    selectPerson(person.id);
  });
  button.addEventListener("dblclick", () => {
    state.focusId = person.id;
    saveState();
    renderTree();
    centerSelected();
  });
  button.addEventListener("pointerdown", (event) => startNodeDrag(event, button, node));
  button.addEventListener("mousedown", (event) => startNodeDrag(event, button, node));
  els.treeCanvas.appendChild(button);
}

function renderRelationshipList() {
  const person = selectedPerson();
  if (!person) {
    els.relationshipList.innerHTML = "";
    return;
  }

  const rows = [
    ...person.parents.map((id) => relationshipRow("Parent", id, "parent")),
    ...person.partners.map((id) => relationshipRow("Partner", id, "partner")),
    ...person.children.map((id) => relationshipRow("Child", id, "child"))
  ].filter(Boolean);

  els.relationshipList.innerHTML = rows.length ? rows.join("") : `<p class="empty-copy">No relationships yet.</p>`;
  els.relationshipList.querySelectorAll("button[data-remove-relationship]").forEach((button) => {
    button.addEventListener("click", () => removeRelationship(button.dataset.removeRelationship, button.dataset.personId));
  });
}

function relationshipRow(label, relatedId, kind) {
  const related = state.people[relatedId];
  if (!related) return "";
  return `
    <div class="relationship-row">
      <div>
        <span>${escapeHtml(label)}</span>
        <strong>${escapeHtml(displayName(related))}</strong>
      </div>
      <button type="button" data-remove-relationship="${escapeAttribute(kind)}" data-person-id="${escapeAttribute(relatedId)}" title="Remove relationship" aria-label="Remove ${escapeAttribute(label.toLowerCase())} relationship">&times;</button>
    </div>
  `;
}

function drawParentLink(link) {
  const startX = link.parents?.length
    ? link.parents.reduce((sum, parent) => sum + parent.x + 89, 0) / link.parents.length
    : link.fromX;
  const startY = link.parents?.length ? Math.max(...link.parents.map((parent) => parent.y + 84)) : link.fromY;
  const endX = link.to.x + 89;
  const endY = link.to.y;
  const midY = startY + (endY - startY) / 2;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", link.color || "#8f8069");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  els.relationshipLines.appendChild(path);
}

function drawRelationshipLines(layout) {
  els.relationshipLines.innerHTML = "";
  layout.links.forEach(drawParentLink);
  layout.partnerLinks.forEach((link) => drawPartnerLink(link.from, link.to, link.color));
}

function drawPartnerLink(from, to, color = "#b65c71") {
  const cardWidth = 178;
  const cardMidY = 42;
  const left = from.x <= to.x ? from : to;
  const right = from.x <= to.x ? to : from;
  const startX = left.x + cardWidth;
  const startY = left.y + cardMidY;
  const endX = right.x;
  const endY = right.y + cardMidY;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${startX} ${startY} L ${endX} ${endY}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", color);
  path.setAttribute("stroke-width", "3");
  path.setAttribute("stroke-linecap", "round");
  path.setAttribute("stroke-dasharray", "7 5");
  els.relationshipLines.appendChild(path);
}

function layoutBounds(nodes) {
  return nodes.reduce(
    (bounds, node) => ({
      maxX: Math.max(bounds.maxX, node.x),
      maxY: Math.max(bounds.maxY, node.y)
    }),
    { maxX: 0, maxY: 0 }
  );
}

function handleFormInput(event) {
  const person = selectedPerson();
  if (!person || !event.target.name) return;
  person[event.target.name] = event.target.value;
  if (event.target.name === "gender") {
    person.color = "";
  }
  markDirty();
  renderEditor();
  renderTree();
}

function addRelative(action) {
  const person = selectedPerson();
  if (!person) return;

  const id = createPerson({ givenName: "New", surname: relationshipLabel(action), gender: "unknown" });
  const relative = state.people[id];

  if (action === "add-person") {
    state.selectedId = id;
    state.focusId = id;
    markDirty();
    render();
    centerSelected();
    return;
  }
  if (action === "add-parent") {
    connectParentChild(relative.id, person.id);
  }
  if (action === "add-child") {
    connectParentChild(person.id, relative.id);
    person.partners.forEach((partnerId) => connectParentChild(partnerId, relative.id));
  }
  if (action === "add-partner") {
    connectPartners(person.id, relative.id);
  }
  if (action === "add-sibling") {
    person.parents.forEach((parentId) => connectParentChild(parentId, relative.id));
    if (!person.parents.length) {
      const parentId = createPerson({ givenName: "Shared", surname: "Parent", gender: "unknown" });
      connectParentChild(parentId, person.id);
      connectParentChild(parentId, relative.id);
    }
  }

  state.selectedId = id;
  state.focusId = person.id;
  markDirty();
  render();
  centerSelected();
}

function relationshipLabel(action) {
  return {
    "add-person": "Person",
    "add-parent": "Parent",
    "add-child": "Child",
    "add-partner": "Partner",
    "add-sibling": "Sibling"
  }[action] || "Person";
}

function createPerson(overrides = {}) {
  const id = crypto.randomUUID ? crypto.randomUUID() : `person-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  state.people[id] = {
    id,
    givenName: "",
    surname: "",
    birthSurname: "",
    gender: "unknown",
    color: "",
    birthDate: "",
    deathDate: "",
    birthPlace: "",
    profession: "",
    email: "",
    phone: "",
    photo: "",
    bio: "",
    parents: [],
    partners: [],
    children: [],
    ...overrides
  };
  return id;
}

function connectExistingPerson(kind) {
  const person = selectedPerson();
  const target = state.people[els.existingPersonSelect.value];
  if (!person || !target || person.id === target.id) return;

  if (kind === "partner") {
    connectPartners(person.id, target.id);
    showToast(`${displayName(target)} is now a partner of ${displayName(person)}.`);
  }
  if (kind === "parent") {
    connectParentChild(target.id, person.id);
    showToast(`${displayName(target)} is now a parent of ${displayName(person)}.`);
  }
  if (kind === "child") {
    connectParentChild(person.id, target.id);
    person.partners.forEach((partnerId) => connectParentChild(partnerId, target.id));
    showToast(`${displayName(target)} is now a child of ${displayName(person)}.`);
  }

  state.focusId = person.id;
  markDirty();
  render();
  centerSelected();
}

function removeRelationship(kind, relatedId) {
  const person = selectedPerson();
  const related = state.people[relatedId];
  if (!person || !related) return;

  if (kind === "parent") {
    disconnectParentChild(related.id, person.id);
  }
  if (kind === "child") {
    disconnectParentChild(person.id, related.id);
  }
  if (kind === "partner") {
    disconnectPartners(person.id, related.id);
  }

  markDirty();
  render();
  centerSelected();
  showToast(`Removed relationship with ${displayName(related)}.`);
}

function updateExistingRelationshipButtons() {
  const selected = selectedPerson();
  const target = state.people[els.existingPersonSelect.value];
  const hasTarget = Boolean(selected && target && selected.id !== target.id);
  els.connectPartnerBtn.disabled = !hasTarget || selected.partners.includes(target.id);
  els.connectParentBtn.disabled = !hasTarget || selected.parents.includes(target.id) || wouldCreateParentCycle(target.id, selected.id);
  els.connectChildBtn.disabled = !hasTarget || selected.children.includes(target.id) || wouldCreateParentCycle(selected.id, target.id);
}

function connectParentChild(parentId, childId) {
  const parent = state.people[parentId];
  const child = state.people[childId];
  if (!parent || !child || parentId === childId || wouldCreateParentCycle(parentId, childId)) return;
  parent.children = uniqueIds([...parent.children, childId]);
  child.parents = uniqueIds([...child.parents, parentId]);
}

function disconnectParentChild(parentId, childId) {
  const parent = state.people[parentId];
  const child = state.people[childId];
  if (!parent || !child) return;
  parent.children = parent.children.filter((id) => id !== childId);
  child.parents = child.parents.filter((id) => id !== parentId);
}

function connectPartners(aId, bId) {
  const a = state.people[aId];
  const b = state.people[bId];
  if (!a || !b || aId === bId) return;
  a.partners = uniqueIds([...a.partners, bId]);
  b.partners = uniqueIds([...b.partners, aId]);
}

function disconnectPartners(aId, bId) {
  const a = state.people[aId];
  const b = state.people[bId];
  if (!a || !b) return;
  a.partners = a.partners.filter((id) => id !== bId);
  b.partners = b.partners.filter((id) => id !== aId);
}

function deleteSelectedPerson() {
  const person = selectedPerson();
  if (!person) return;
  const people = Object.values(state.people);
  if (people.length === 1) {
    showToast("A tree needs at least one person.");
    return;
  }
  const ok = window.confirm(`Delete ${displayName(person)} from this tree?`);
  if (!ok) return;

  Object.values(state.people).forEach((other) => {
    other.parents = other.parents.filter((id) => id !== person.id);
    other.partners = other.partners.filter((id) => id !== person.id);
    other.children = other.children.filter((id) => id !== person.id);
  });
  delete state.people[person.id];
  state.selectedId = Object.keys(state.people)[0];
  state.focusId = state.selectedId;
  markDirty();
  render();
}

function selectPerson(id) {
  if (!state.people[id]) return;
  state.selectedId = id;
  markDirty();
  render();
}

function selectedPerson() {
  return state.people[state.selectedId] || Object.values(state.people)[0];
}

function displayName(person) {
  return [person.givenName, person.surname].filter(Boolean).join(" ").trim() || "Unnamed person";
}

function initials(person) {
  const bits = [person.givenName, person.surname].filter(Boolean);
  if (!bits.length) return "?";
  return bits.map((bit) => bit[0]).join("").slice(0, 2).toUpperCase();
}

function metaLine(person) {
  const dates = [person.birthDate, person.deathDate].filter(Boolean).join(" - ");
  return [dates, person.birthPlace, person.profession].filter(Boolean).join(" · ");
}

function relationshipCount(person) {
  const count = person.parents.length + person.partners.length + person.children.length;
  return count === 1 ? "1 connection" : `${count} connections`;
}

function colorForGender(gender) {
  if (gender === "female") return "#e46f9b";
  if (gender === "male") return "#3d8bff";
  if (gender === "other") return "#c28b32";
  return "#6f7d76";
}

function colorForPerson(person) {
  return colorForGender(person.gender);
}

function wouldCreateParentCycle(parentId, childId) {
  if (parentId === childId) return true;
  const stack = [childId];
  const seen = new Set();

  while (stack.length) {
    const id = stack.pop();
    if (id === parentId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const person = state.people[id];
    if (person) stack.push(...person.children);
  }

  return false;
}

function uniqueIds(ids) {
  return [...new Set((ids || []).filter(Boolean))];
}

function familyKeyForParents(parents) {
  return parents
    .map((parent) => parent.id)
    .sort()
    .join("|");
}

function colorForFamilyKey(key) {
  let hash = 0;
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0;
  }
  return FAMILY_LINE_COLORS[hash % FAMILY_LINE_COLORS.length];
}

function normalizeNodePositions(positions) {
  if (!positions || typeof positions !== "object") return {};
  return Object.fromEntries(
    Object.entries(positions)
      .map(([id, position]) => [
        id,
        {
          x: Number(position?.x),
          y: Number(position?.y)
        }
      ])
      .filter(([, position]) => Number.isFinite(position.x) && Number.isFinite(position.y))
  );
}

function normalizeViewport(viewport) {
  const left = Number(viewport?.left);
  const top = Number(viewport?.top);
  return {
    left: Number.isFinite(left) ? Math.max(0, left) : 0,
    top: Number.isFinite(top) ? Math.max(0, top) : 0
  };
}

function captureViewportPosition() {
  if (!els.treeViewport) return;
  state.viewport = {
    left: Math.max(0, Math.round(els.treeViewport.scrollLeft)),
    top: Math.max(0, Math.round(els.treeViewport.scrollTop))
  };
}

function rememberViewportPosition() {
  window.clearTimeout(rememberViewportPosition.timer);
  rememberViewportPosition.timer = window.setTimeout(() => {
    captureViewportPosition();
    saveState();
  }, 250);
}

function restoreViewportPosition() {
  if (!state.viewport || (!state.viewport.left && !state.viewport.top)) return false;
  els.treeViewport.scrollTo({
    left: state.viewport.left,
    top: state.viewport.top,
    behavior: "auto"
  });
  return true;
}

function setActiveTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    const active = tab.dataset.tab === name;
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.panel === name);
  });
}

function renderSearch() {
  const query = els.searchInput.value.trim().toLowerCase();
  if (!query) {
    els.searchResults.classList.add("hidden");
    els.searchResults.innerHTML = "";
    return;
  }

  const matches = Object.values(state.people)
    .filter((person) => displayName(person).toLowerCase().includes(query))
    .slice(0, 8);

  els.searchResults.innerHTML = matches.length
    ? matches
        .map(
          (person) => `
            <button type="button" data-id="${escapeAttribute(person.id)}">
              <span>${escapeHtml(displayName(person))}</span>
              <span>${escapeHtml(metaLine(person) || relationshipCount(person))}</span>
            </button>
          `
        )
        .join("")
    : `<button type="button" disabled>No matches</button>`;

  els.searchResults.querySelectorAll("button[data-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedId = button.dataset.id;
      state.focusId = button.dataset.id;
      els.searchInput.value = "";
      els.searchResults.classList.add("hidden");
      saveState();
      render();
      centerSelected();
    });
  });
  els.searchResults.classList.remove("hidden");
}

function setZoom(value) {
  state.zoom = Math.min(1.5, Math.max(0.55, Number(value.toFixed(2))));
  saveState();
  renderTree();
}

function toggleFullscreen() {
  if (!document.fullscreenElement) {
    els.treeArea.requestFullscreen?.();
    return;
  }
  document.exitFullscreen?.();
}

function updateFullscreenButton() {
  const isFullscreen = document.fullscreenElement === els.treeArea;
  els.fullscreenBtn.classList.toggle("active", isFullscreen);
  els.fullscreenBtn.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Fullscreen chart");
  els.fullscreenBtn.title = isFullscreen ? "Exit fullscreen" : "Fullscreen chart";
}

function toggleMoveMode() {
  state.moveMode = !state.moveMode;
  saveState();
  updateMoveModeButton();
}

function updateMoveModeButton() {
  els.moveNodesBtn.classList.toggle("active", state.moveMode);
  els.moveNodesBtn.setAttribute("aria-pressed", String(state.moveMode));
  els.treeViewport.classList.toggle("moving-enabled", state.moveMode);
}

function resetMovedNodes() {
  if (!Object.keys(state.nodePositions).length) {
    showToast("No moved nodes to reset.");
    return;
  }
  const ok = window.confirm("Reset all manually moved nodes?");
  if (!ok) return;
  state.nodePositions = {};
  saveState();
  renderTree();
  centerSelected();
  showToast("Manual node positions reset.");
}

function startNodeDrag(event, card, node) {
  if (!state.moveMode || (Number.isFinite(event.button) && event.button !== 0)) return;
  if (card.classList.contains("dragging")) return;
  event.preventDefault();
  state.selectedId = node.id;
  const startClientX = event.clientX;
  const startClientY = event.clientY;
  const startX = node.x;
  const startY = node.y;
  let moved = false;
  const moveEventName = event.type === "mousedown" ? "mousemove" : "pointermove";
  const upEventName = event.type === "mousedown" ? "mouseup" : "pointerup";
  const cancelEventName = event.type === "mousedown" ? "mouseleave" : "pointercancel";

  if (event.pointerId !== undefined) {
    card.setPointerCapture(event.pointerId);
  }
  card.classList.add("dragging");

  const onPointerMove = (moveEvent) => {
    const nextX = Math.max(20, startX + (moveEvent.clientX - startClientX) / state.zoom);
    const nextY = Math.max(20, startY + (moveEvent.clientY - startClientY) / state.zoom);
    if (Math.abs(nextX - startX) > 2 || Math.abs(nextY - startY) > 2) {
      moved = true;
      card.dataset.dragged = "true";
    }
    node.x = Math.round(nextX);
    node.y = Math.round(nextY);
    state.nodePositions[node.id] = { x: node.x, y: node.y };
    card.style.left = `${node.x}px`;
    card.style.top = `${node.y}px`;
    if (currentLayout) drawRelationshipLines(currentLayout);
  };

  const endDrag = () => {
    card.classList.remove("dragging");
    document.removeEventListener(moveEventName, onPointerMove);
    document.removeEventListener(upEventName, endDrag);
    document.removeEventListener(cancelEventName, endDrag);
    if (moved) {
      markDirty();
      renderEditor();
      renderRelationshipList();
    }
  };

  document.addEventListener(moveEventName, onPointerMove);
  document.addEventListener(upEventName, endDrag);
  document.addEventListener(cancelEventName, endDrag);
}

function centerSelected() {
  const card = els.treeCanvas.querySelector(".person-card.selected");
  if (!card) return;
  const x = (card.offsetLeft + card.offsetWidth / 2) * state.zoom - els.treeViewport.clientWidth / 2;
  const y = (card.offsetTop + card.offsetHeight / 2) * state.zoom - els.treeViewport.clientHeight / 2;
  els.treeViewport.scrollTo({ left: Math.max(0, x), top: Math.max(0, y), behavior: "smooth" });
}

function newTree() {
  const ok = window.confirm("Start a new tree? Your current local tree will be replaced unless you export it first.");
  if (!ok) return;
  Object.assign(state, clone(DEFAULT_DATA));
  saveState();
  render();
  centerSelected();
}

function exportJson() {
  captureViewportPosition();
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function exportTreeImage() {
  const layout = currentLayout || buildLayout();
  if (!layout.nodes.length) {
    showToast("Add someone to the tree before saving an image.");
    return;
  }

  const bounds = layoutBounds(layout.nodes);
  const width = Math.ceil(Math.max(1300, bounds.maxX + 280));
  const height = Math.ceil(Math.max(900, bounds.maxY + 180));
  const scale = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);

  drawImageBackground(ctx, width, height);
  layout.links.forEach((link) => drawImageParentLink(ctx, link));
  layout.partnerLinks.forEach((link) => drawImagePartnerLink(ctx, link));
  layout.nodes.forEach((node) => drawImagePersonCard(ctx, node));

  canvas.toBlob((blob) => {
    if (!blob) {
      showToast("Image export failed.");
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("Saved chart image.");
  }, "image/png");
}

function drawImageBackground(ctx, width, height) {
  ctx.fillStyle = "#f3f6f3";
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(80, 68, 45, 0.08)";
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x += 28) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y += 28) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
}

function drawImageParentLink(ctx, link) {
  const startX = link.parents?.length
    ? link.parents.reduce((sum, parent) => sum + parent.x + 89, 0) / link.parents.length
    : link.fromX;
  const startY = link.parents?.length ? Math.max(...link.parents.map((parent) => parent.y + 84)) : link.fromY;
  const endX = link.to.x + 89;
  const endY = link.to.y;
  const midY = startY + (endY - startY) / 2;
  ctx.save();
  ctx.strokeStyle = link.color || "#8f8069";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(startX, startY);
  ctx.bezierCurveTo(startX, midY, endX, midY, endX, endY);
  ctx.stroke();
  ctx.restore();
}

function drawImagePartnerLink(ctx, link) {
  const cardWidth = 178;
  const cardMidY = 42;
  const left = link.from.x <= link.to.x ? link.from : link.to;
  const right = link.from.x <= link.to.x ? link.to : link.from;
  ctx.save();
  ctx.strokeStyle = link.color || "#b65c71";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.setLineDash([7, 5]);
  ctx.beginPath();
  ctx.moveTo(left.x + cardWidth, left.y + cardMidY);
  ctx.lineTo(right.x, right.y + cardMidY);
  ctx.stroke();
  ctx.restore();
}

function drawImagePersonCard(ctx, node) {
  const person = node.person;
  const x = node.x;
  const y = node.y;
  const width = 178;
  const height = 84;
  const color = colorForPerson(person);

  ctx.save();
  ctx.shadowColor = "rgba(48, 40, 28, 0.16)";
  ctx.shadowBlur = 22;
  ctx.shadowOffsetY = 8;
  roundedRect(ctx, x, y, width, height, 8);
  ctx.fillStyle = "#ffffff";
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.lineWidth = person.id === state.selectedId ? 4 : 2;
  ctx.strokeStyle = color;
  ctx.stroke();

  ctx.fillStyle = color;
  roundedRect(ctx, x, y, 7, height, 8);
  ctx.fill();

  roundedRect(ctx, x + 14, y + 21, 42, 42, 8);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 15px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(initials(person), x + 35, y + 42);

  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillStyle = "#1f2823";
  ctx.font = "800 14px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  drawWrappedText(ctx, displayName(person), x + 65, y + 18, 96, 17, 2);
  ctx.fillStyle = "#65726c";
  ctx.font = "12px system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif";
  drawWrappedText(ctx, metaLine(person) || relationshipCount(person), x + 65, y + 52, 96, 15, 1);
  ctx.restore();
}

function roundedRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + width - r, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + r);
  ctx.lineTo(x + width, y + height - r);
  ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
  ctx.lineTo(x + r, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawWrappedText(ctx, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  words.forEach((word) => {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !line) {
      line = next;
      return;
    }
    lines.push(line);
    line = word;
  });
  if (line) lines.push(line);

  lines.slice(0, maxLines).forEach((textLine, index) => {
    let value = textLine;
    if (index === maxLines - 1 && lines.length > maxLines) {
      while (value.length > 1 && ctx.measureText(`${value}...`).width > maxWidth) {
        value = value.slice(0, -1);
      }
      value = `${value}...`;
    }
    ctx.fillText(value, x, y + index * lineHeight);
  });
}

async function importFile(event) {
  const file = event.target.files[0];
  if (!file) return;
  const text = await file.text();
  try {
    const imported = file.name.toLowerCase().endsWith(".json") ? JSON.parse(text) : parseGedcom(text);
    Object.assign(state, normalizeState(imported));
    saveState();
    render();
    centerSelected();
    showToast("Imported family tree.");
  } catch (error) {
    console.error(error);
    showToast("Import failed. Use exported JSON or a simple GEDCOM file.");
  } finally {
    event.target.value = "";
  }
}

function parseGedcom(text) {
  const people = {};
  const familyRecords = {};
  let current = null;

  text.split(/\r?\n/).forEach((rawLine) => {
    const line = rawLine.trim();
    const match = line.match(/^(\d+)\s+(?:(@[^@]+@)\s+)?(\w+)(?:\s+(.*))?$/);
    if (!match) return;
    const level = Number(match[1]);
    const pointer = match[2];
    const tag = match[3];
    const value = match[4] || "";

    if (level === 0 && pointer && tag === "INDI") {
      current = { type: "person", id: pointer, section: "" };
      people[pointer] = createImportedPerson(pointer);
      return;
    }
    if (level === 0 && pointer && tag === "FAM") {
      current = { type: "family", id: pointer, section: "" };
      familyRecords[pointer] = { parents: [], children: [] };
      return;
    }
    if (!current) return;

    if (current.type === "person") {
      const person = people[current.id];
      if (tag === "NAME") {
        const cleaned = value.replace(/\//g, "").trim();
        const parts = cleaned.split(/\s+/);
        person.givenName = parts.slice(0, -1).join(" ") || cleaned;
        person.surname = parts.length > 1 ? parts.at(-1) : "";
      }
      if (tag === "SEX") {
        person.gender = value === "F" ? "female" : value === "M" ? "male" : "unknown";
        person.color = colorForGender(person.gender);
      }
      if (tag === "BIRT" || tag === "DEAT") current.section = tag;
      if (tag === "DATE" && current.section === "BIRT") person.birthDate = value;
      if (tag === "DATE" && current.section === "DEAT") person.deathDate = value;
      if (tag === "PLAC" && current.section === "BIRT") person.birthPlace = value;
      if (tag === "NOTE") person.bio = [person.bio, value].filter(Boolean).join("\n");
    }

    if (current.type === "family") {
      const family = familyRecords[current.id];
      if (tag === "HUSB" || tag === "WIFE") family.parents.push(value);
      if (tag === "CHIL") family.children.push(value);
    }
  });

  Object.values(familyRecords).forEach((family) => {
    family.parents.forEach((a) => {
      family.parents.forEach((b) => {
        if (a !== b && people[a] && people[b]) {
          people[a].partners = uniqueIds([...people[a].partners, b]);
        }
      });
      family.children.forEach((child) => {
        if (people[a] && people[child]) {
          people[a].children = uniqueIds([...people[a].children, child]);
          people[child].parents = uniqueIds([...people[child].parents, a]);
        }
      });
    });
  });

  const ids = Object.keys(people);
  if (!ids.length) throw new Error("No GEDCOM people found");
  return { people, selectedId: ids[0], focusId: ids[0], zoom: 1, depth: "compact" };
}

function createImportedPerson(id) {
  return {
    id,
    givenName: "",
    surname: "",
    birthSurname: "",
    gender: "unknown",
    color: colorForGender("unknown"),
    birthDate: "",
    deathDate: "",
    birthPlace: "",
    profession: "",
    email: "",
    phone: "",
    photo: "",
    bio: "",
    parents: [],
    partners: [],
    children: []
  };
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.remove("hidden");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.add("hidden"), 2600);
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    return {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    }[char];
  });
}

function escapeAttribute(value) {
  return escapeHtml(value).replace(/`/g, "&#96;");
}

function clone(value) {
  if (typeof structuredClone === "function") {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}
