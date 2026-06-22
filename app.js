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
  depth: "compact"
};

const state = loadState();
const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  bindEvents();
  render();
  requestAnimationFrame(centerSelected);
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
    "deletePersonBtn",
    "searchInput",
    "searchResults",
    "zoomOutBtn",
    "zoomResetBtn",
    "zoomInBtn",
    "treeViewport",
    "relationshipLines",
    "treeCanvas",
    "fileInput",
    "toast"
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
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
    depth: data.depth === "full" ? "full" : "compact"
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

  layout.links.forEach((link) => drawLink(link.from, link.to, link.type));
  layout.partnerLinks.forEach((link) => drawPartnerLink(link.from, link.to));
  layout.nodes.forEach(renderPersonCard);
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
  const levelGap = 170;
  const partnerGap = 18;
  const groupGap = 78;
  const leftPad = 110;
  const startY = 90 + Math.abs(Math.min(...levelKeys, 0)) * levelGap;
  const previousCenters = new Map();

  levelKeys.forEach((level) => {
    const groups = buildGenerationGroups(levels.get(level), generationById);
    groups.sort((a, b) => groupSortValue(a, previousCenters) - groupSortValue(b, previousCenters));

    let cursor = leftPad;
    const y = startY + level * levelGap;
    groups.forEach((group) => {
      const groupWidth = group.length * cardWidth + (group.length - 1) * partnerGap;
      group.forEach((id, index) => {
        const node = {
          id,
          person: state.people[id],
          x: cursor + index * (cardWidth + partnerGap),
          y
        };
        nodeMap.set(id, node);
        nodes.push(node);
      });
      const center = cursor + groupWidth / 2;
      group.forEach((id) => previousCenters.set(id, center));
      cursor += groupWidth + groupGap;
    });
  });

  const rowsByLevel = new Map();
  nodes.forEach((node) => {
    const level = generationById.get(node.id);
    if (!rowsByLevel.has(level)) rowsByLevel.set(level, []);
    rowsByLevel.get(level).push(node);
  });

  rowsByLevel.forEach((rowNodes) => {
    const rowMinX = Math.min(...rowNodes.map((node) => node.x));
    const rowMaxX = Math.max(...rowNodes.map((node) => node.x + cardWidth));
    const rowWidth = rowMaxX - rowMinX;
    const offset = Math.max(0, (980 - rowWidth) / 2 - rowMinX);
    rowNodes.forEach((node) => {
      node.x += offset;
    });
  });

  const childParentCenters = new Map();
  nodes.forEach((node) => {
    const visibleParents = node.person.parents.map((id) => nodeMap.get(id)).filter(Boolean);
    if (visibleParents.length) {
      childParentCenters.set(
        node.id,
        visibleParents.reduce((sum, parent) => sum + parent.x + cardWidth / 2, 0) / visibleParents.length
      );
    }
  });

  rowsByLevel.forEach((rowNodes) => {
    rowNodes
      .filter((node) => childParentCenters.has(node.id) && !hasVisiblePartner(node, generationById, nodeMap))
      .forEach((node) => {
        const targetX = childParentCenters.get(node.id) - cardWidth / 2;
        const collision = rowNodes.some((other) => {
          if (other.id === node.id) return false;
          return Math.abs(targetX - other.x) < cardWidth + partnerGap;
        });
        if (!collision) {
          node.x = Math.max(leftPad, targetX);
        }
      });
  });

  const links = [];
  const partnerLinks = [];
  nodes.forEach((node) => {
    node.person.children.forEach((childId) => {
      const child = nodeMap.get(childId);
      if (child) links.push({ from: node, to: child, type: "parent" });
    });
    node.person.partners.forEach((partnerId) => {
      const partner = nodeMap.get(partnerId);
      if (partner && node.id < partner.id) {
        partnerLinks.push({ from: node, to: partner });
      }
    });
  });

  return { nodes, links, partnerLinks };
}

function hasVisiblePartner(node, generationById, nodeMap) {
  return node.person.partners.some((partnerId) => {
    return nodeMap.has(partnerId) && generationById.get(partnerId) === generationById.get(node.id);
  });
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

  return groups;
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

function groupSortValue(group, previousCenters) {
  const parentCenters = group.flatMap((id) => {
    return state.people[id].parents.map((parentId) => previousCenters.get(parentId)).filter((value) => value !== undefined);
  });
  if (parentCenters.length) {
    return parentCenters.reduce((sum, value) => sum + value, 0) / parentCenters.length;
  }
  if (group.includes(state.focusId)) return -2;
  if (group.includes(state.selectedId)) return -1;
  return group.map((id) => displayName(state.people[id]).toLowerCase()).sort()[0].charCodeAt(0) || 0;
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
  button.addEventListener("click", () => selectPerson(person.id));
  button.addEventListener("dblclick", () => {
    state.focusId = person.id;
    saveState();
    renderTree();
    centerSelected();
  });
  els.treeCanvas.appendChild(button);
}

function drawLink(from, to, type) {
  const startX = from.x + 89;
  const startY = from.y + 84;
  const endX = to.x + 89;
  const endY = to.y;
  const midY = startY + (endY - startY) / 2;
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", `M ${startX} ${startY} C ${startX} ${midY}, ${endX} ${midY}, ${endX} ${endY}`);
  path.setAttribute("fill", "none");
  path.setAttribute("stroke", type === "parent" ? "#8f8069" : "#a9945e");
  path.setAttribute("stroke-width", "2.5");
  path.setAttribute("stroke-linecap", "round");
  els.relationshipLines.appendChild(path);
}

function drawPartnerLink(from, to) {
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
  path.setAttribute("stroke", "#b65c71");
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

function connectPartners(aId, bId) {
  const a = state.people[aId];
  const b = state.people[bId];
  if (!a || !b || aId === bId) return;
  a.partners = uniqueIds([...a.partners, bId]);
  b.partners = uniqueIds([...b.partners, aId]);
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
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `family-tree-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
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
