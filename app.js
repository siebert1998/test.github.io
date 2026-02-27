const STORAGE_KEY = "fiets-weekkalender-v1";

const daysNl = ["Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

const state = loadState();

const weekLabel = document.querySelector("#weekLabel");
const calendarGrid = document.querySelector("#calendarGrid");
const dayTemplate = document.querySelector("#dayTemplate");
const friendNameInput = document.querySelector("#friendName");
const addFriendBtn = document.querySelector("#addFriend");
const friendsList = document.querySelector("#friendsList");
const friendsPanel = document.querySelector("#friendsPanel");
const toggleFriendsBtn = document.querySelector("#toggleFriends");
const groupSelect = document.querySelector("#groupSelect");
const addGroupBtn = document.querySelector("#addGroupBtn");
const renameGroupBtn = document.querySelector("#renameGroupBtn");
const deleteGroupBtn = document.querySelector("#deleteGroupBtn");
const prevWeekBtn = document.querySelector("#prevWeek");
const nextWeekBtn = document.querySelector("#nextWeek");
const exportBtn = document.querySelector("#exportBtn");
const importInput = document.querySelector("#importInput");
let mapCounter = 0;

addFriendBtn.addEventListener("click", () => {
  const name = friendNameInput.value.trim();
  if (!name) return;

  const group = getActiveGroup();
  if (!group.friends.includes(name)) {
    group.friends.push(name);
    saveState();
    render();
  }
  friendNameInput.value = "";
});

friendNameInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") addFriendBtn.click();
});

toggleFriendsBtn.addEventListener("click", () => {
  state.friendsCollapsed = !state.friendsCollapsed;
  saveState();
  renderFriendsPanel();
});

addGroupBtn.addEventListener("click", () => {
  const rawName = prompt("Naam van de nieuwe fietsgroep:", "Vrienden Deerlijk");
  if (!rawName) return;
  const name = rawName.trim();
  if (!name) return;

  const id = createGroupId(name);
  if (state.groups[id]) {
    alert("Deze groep bestaat al. Kies een andere naam.");
    return;
  }

  state.groups[id] = createEmptyGroup(name);
  state.activeGroupId = id;
  ensureWeekData(getWeekKey());
  saveState();
  render();
});

groupSelect.addEventListener("change", () => {
  const selectedId = groupSelect.value;
  if (!state.groups[selectedId]) return;
  state.activeGroupId = selectedId;
  ensureWeekData(getWeekKey());
  saveState();
  render();
});

renameGroupBtn.addEventListener("click", () => {
  const currentGroup = getActiveGroup();
  const rawName = prompt("Nieuwe naam voor deze groep:", currentGroup.name);
  if (!rawName) return;
  const name = rawName.trim();
  if (!name) return;
  currentGroup.name = name;
  saveState();
  render();
});

deleteGroupBtn.addEventListener("click", () => {
  const groupIds = Object.keys(state.groups);
  if (groupIds.length <= 1) {
    alert("Je moet minstens 1 groep behouden.");
    return;
  }

  const currentId = state.activeGroupId;
  const currentGroup = state.groups[currentId];
  const confirmed = confirm(`Groep \"${currentGroup.name}\" verwijderen?`);
  if (!confirmed) return;

  delete state.groups[currentId];
  state.activeGroupId = Object.keys(state.groups)[0];
  ensureWeekData(getWeekKey());
  saveState();
  render();
});

prevWeekBtn.addEventListener("click", () => {
  state.weekOffset -= 1;
  ensureWeekData(getWeekKey());
  saveState();
  render();
});

nextWeekBtn.addEventListener("click", () => {
  state.weekOffset += 1;
  ensureWeekData(getWeekKey());
  saveState();
  render();
});

exportBtn.addEventListener("click", () => {
  const group = getActiveGroup();
  const weekKey = getWeekKey();
  const payload = {
    exportedAt: new Date().toISOString(),
    groupId: state.activeGroupId,
    groupName: group.name,
    weekKey,
    friends: group.friends,
    days: group.weeks[weekKey]
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `fiets-week-${group.name}-${weekKey}.json`;
  a.click();
  URL.revokeObjectURL(url);
});

importInput.addEventListener("change", async (event) => {
  const file = event.target.files?.[0];
  if (!file) return;

  try {
    const raw = await file.text();
    const payload = JSON.parse(raw);
    if (!payload?.weekKey || !Array.isArray(payload?.days)) {
      throw new Error("Ongeldig bestand");
    }

    let targetGroupId = state.activeGroupId;
    if (payload.groupId) {
      if (!state.groups[payload.groupId]) {
        state.groups[payload.groupId] = createEmptyGroup(payload.groupName || payload.groupId);
      }
      targetGroupId = payload.groupId;
    }

    const targetGroup = state.groups[targetGroupId];
    targetGroup.friends = Array.from(new Set([...(targetGroup.friends || []), ...(payload.friends || [])]));
    targetGroup.weeks[payload.weekKey] = payload.days;

    state.weekOffset = offsetFromWeekKey(payload.weekKey);
    state.activeGroupId = targetGroupId;
    saveState();
    render();
  } catch {
    alert("Importeren mislukt: controleer of dit een geldig weekbestand is.");
  } finally {
    importInput.value = "";
  }
});

function render() {
  ensureWeekData(getWeekKey());
  renderGroupControls();
  renderFriendsPanel();
  renderFriends();
  renderWeek();
}

function renderGroupControls() {
  const currentId = state.activeGroupId;
  groupSelect.innerHTML = "";

  Object.entries(state.groups).forEach(([id, group]) => {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = group.name;
    option.selected = id === currentId;
    groupSelect.append(option);
  });

  deleteGroupBtn.disabled = Object.keys(state.groups).length <= 1;
}

function renderFriendsPanel() {
  const collapsed = Boolean(state.friendsCollapsed);
  friendsPanel.classList.toggle("is-collapsed", collapsed);
  toggleFriendsBtn.textContent = collapsed ? "Openen" : "-";
  toggleFriendsBtn.setAttribute("aria-expanded", String(!collapsed));
}

function renderFriends() {
  const group = getActiveGroup();
  friendsList.innerHTML = "";

  group.friends.forEach((name) => {
    const li = document.createElement("li");
    const label = document.createElement("span");
    label.textContent = name;

    const removeBtn = document.createElement("button");
    removeBtn.type = "button";
    removeBtn.textContent = "x";
    removeBtn.addEventListener("click", () => {
      group.friends = group.friends.filter((friend) => friend !== name);
      Object.values(group.weeks).forEach((weekDays) => {
        weekDays.forEach((day) => {
          day.participants = (day.participants || []).filter((p) => p !== name);
        });
      });
      saveState();
      render();
    });

    li.append(label, removeBtn);
    friendsList.append(li);
  });
}

function renderWeek() {
  const group = getActiveGroup();
  const friends = group.friends;

  calendarGrid.innerHTML = "";
  const weekDates = getWeekDates(state.weekOffset);
  const weekKey = getWeekKey();
  ensureWeekData(weekKey);

  const firstDate = weekDates[0];
  const lastDate = weekDates[6];
  weekLabel.textContent = `${formatDate(firstDate)} - ${formatDate(lastDate)}`;

  weekDates.forEach((date, index) => {
    const day = group.weeks[weekKey][index];
    const frag = dayTemplate.content.cloneNode(true);

    const title = frag.querySelector(".day-title");
    title.textContent = `${daysNl[index]} (${formatDate(date)})`;

    const gpxInput = frag.querySelector(".gpx-input");
    const gpxUpload = frag.querySelector(".map-upload");
    const gpxName = frag.querySelector(".gpx-name");
    const gpxDownload = frag.querySelector(".download-gpx");
    const gpxRemove = frag.querySelector(".map-remove");
    const mapStats = frag.querySelector(".map-stats");
    const mapPreview = frag.querySelector(".map-preview");
    const mapEmpty = frag.querySelector(".map-empty");

    const mapId = `map-${state.activeGroupId}-${weekKey}-${index}-${mapCounter++}`;
    mapPreview.id = mapId;

    if (day.gpx?.name) {
      gpxName.textContent = `Gekoppeld: ${day.gpx.name}`;
      gpxUpload.textContent = "Vervang";
      gpxDownload.hidden = false;
      gpxRemove.hidden = false;

      const stats = getGpxStats(day.gpx.content);
      if (stats) {
        mapStats.textContent = `${formatKm(stats.distanceKm)} km • ${Math.round(stats.ascentM)} hm`;
        mapStats.hidden = false;
      }
    }

    gpxUpload.addEventListener("click", () => {
      gpxInput.click();
    });

    gpxInput.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      if (!file) return;
      const text = await file.text();
      day.gpx = { name: file.name, content: text };
      saveState();
      renderWeek();
    });

    gpxDownload.addEventListener("click", () => {
      if (!day.gpx?.content) return;
      const blob = new Blob([day.gpx.content], { type: "application/gpx+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = day.gpx.name || `route-${weekKey}-${index + 1}.gpx`;
      a.click();
      URL.revokeObjectURL(url);
    });

    gpxRemove.addEventListener("click", () => {
      day.gpx = null;
      saveState();
      renderWeek();
    });

    const participants = frag.querySelector(".participants");
    if (friends.length === 0) {
      const hint = document.createElement("small");
      hint.textContent = "Voeg eerst vrienden toe bovenaan.";
      participants.append(hint);
    } else {
      friends.forEach((name) => {
        const label = document.createElement("label");
        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.checked = (day.participants || []).includes(name);
        checkbox.addEventListener("change", () => {
          const set = new Set(day.participants || []);
          checkbox.checked ? set.add(name) : set.delete(name);
          day.participants = Array.from(set);
          saveState();
        });

        const text = document.createElement("span");
        text.textContent = name;
        label.append(checkbox, text);
        participants.append(label);
      });
    }

    const notes = frag.querySelector(".notes");
    notes.value = day.notes || "";
    notes.addEventListener("input", () => {
      day.notes = notes.value;
      saveState();
    });

    calendarGrid.append(frag);
    drawGpxMap(day.gpx?.content, mapId, mapEmpty);
  });
}

function drawGpxMap(gpxText, mapId, mapEmptyEl) {
  try {
    if (!gpxText || typeof L === "undefined") {
      if (mapEmptyEl) mapEmptyEl.hidden = false;
      return;
    }

    const points = parseGpxPoints(gpxText);
    if (points.length < 2) {
      if (mapEmptyEl) mapEmptyEl.hidden = false;
      return;
    }

    if (mapEmptyEl) mapEmptyEl.hidden = true;

    const map = L.map(mapId, {
      zoomControl: false,
      attributionControl: false
    });

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      maxZoom: 19
    }).addTo(map);

    const polyline = L.polyline(points, {
      color: "#0f766e",
      weight: 4
    }).addTo(map);

    map.fitBounds(polyline.getBounds(), { padding: [14, 14] });
  } catch {
    if (mapEmptyEl) mapEmptyEl.hidden = false;
  }
}

function parseGpxPoints(gpxText) {
  try {
    const xml = new DOMParser().parseFromString(gpxText, "application/xml");
    const parserError = xml.querySelector("parsererror");
    if (parserError) return [];

    const coords = [];
    const selectors = ["trkpt", "rtept", "wpt"];
    selectors.forEach((selector) => {
      xml.querySelectorAll(selector).forEach((node) => {
        const lat = Number(node.getAttribute("lat"));
        const lon = Number(node.getAttribute("lon"));
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          coords.push([lat, lon]);
        }
      });
    });

    return coords;
  } catch {
    return [];
  }
}

function getGpxStats(gpxText) {
  try {
    const xml = new DOMParser().parseFromString(gpxText, "application/xml");
    const parserError = xml.querySelector("parsererror");
    if (parserError) return null;

    const points = [];
    const selectors = ["trkpt", "rtept", "wpt"];
    selectors.forEach((selector) => {
      xml.querySelectorAll(selector).forEach((node) => {
        const lat = Number(node.getAttribute("lat"));
        const lon = Number(node.getAttribute("lon"));
        const eleNode = node.querySelector("ele");
        const ele = eleNode ? Number(eleNode.textContent) : null;
        if (Number.isFinite(lat) && Number.isFinite(lon)) {
          points.push({
            lat,
            lon,
            ele: Number.isFinite(ele) ? ele : null
          });
        }
      });
    });

    if (points.length < 2) return null;

    let distanceMeters = 0;
    let ascentM = 0;
    for (let i = 1; i < points.length; i += 1) {
      distanceMeters += haversineMeters(points[i - 1], points[i]);
      const prevEle = points[i - 1].ele;
      const currEle = points[i].ele;
      if (Number.isFinite(prevEle) && Number.isFinite(currEle) && currEle > prevEle) {
        ascentM += currEle - prevEle;
      }
    }

    return {
      distanceKm: distanceMeters / 1000,
      ascentM
    };
  } catch {
    return null;
  }
}

function haversineMeters(a, b) {
  const toRad = (deg) => (deg * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos(lat1) * Math.cos(lat2) * sinLon * sinLon;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return earthRadius * c;
}

function formatKm(value) {
  return new Intl.NumberFormat("nl-BE", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

function loadState() {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    if (typeof parsed !== "object" || parsed === null) throw new Error("bad state");

    if (parsed.groups && typeof parsed.groups === "object" && Object.keys(parsed.groups).length > 0) {
      const groups = normalizeGroups(parsed.groups);
      const activeGroupId = groups[parsed.activeGroupId] ? parsed.activeGroupId : Object.keys(groups)[0];
      return {
        weekOffset: Number.isInteger(parsed.weekOffset) ? parsed.weekOffset : 0,
        friendsCollapsed: Boolean(parsed.friendsCollapsed),
        activeGroupId,
        groups
      };
    }

    const legacyGroupId = "groep-main";
    const legacyGroup = {
      name: "Mijn groep",
      friends: Array.isArray(parsed.friends) ? parsed.friends : [],
      weeks: typeof parsed.weeks === "object" && parsed.weeks ? parsed.weeks : {}
    };

    return {
      weekOffset: Number.isInteger(parsed.weekOffset) ? parsed.weekOffset : 0,
      friendsCollapsed: Boolean(parsed.friendsCollapsed),
      activeGroupId: legacyGroupId,
      groups: {
        [legacyGroupId]: normalizeGroup(legacyGroup)
      }
    };
  } catch {
    const fallbackId = "groep-main";
    return {
      weekOffset: 0,
      friendsCollapsed: false,
      activeGroupId: fallbackId,
      groups: {
        [fallbackId]: createEmptyGroup("Mijn groep")
      }
    };
  }
}

function normalizeGroups(rawGroups) {
  const groups = {};
  Object.entries(rawGroups).forEach(([id, group]) => {
    groups[id] = normalizeGroup(group);
  });
  if (Object.keys(groups).length === 0) {
    groups["groep-main"] = createEmptyGroup("Mijn groep");
  }
  return groups;
}

function normalizeGroup(group) {
  return {
    name: typeof group?.name === "string" && group.name.trim() ? group.name.trim() : "Onbenoemde groep",
    friends: Array.isArray(group?.friends) ? group.friends : [],
    weeks: typeof group?.weeks === "object" && group.weeks ? group.weeks : {}
  };
}

function createEmptyGroup(name) {
  return {
    name,
    friends: [],
    weeks: {}
  };
}

function createGroupId(name) {
  const base = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "groep";
  let candidate = `groep-${base}`;
  let counter = 2;
  while (state.groups[candidate]) {
    candidate = `groep-${base}-${counter}`;
    counter += 1;
  }
  return candidate;
}

function getActiveGroup() {
  return state.groups[state.activeGroupId];
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function ensureWeekData(weekKey) {
  const group = getActiveGroup();
  if (!Array.isArray(group.weeks[weekKey]) || group.weeks[weekKey].length !== 7) {
    group.weeks[weekKey] = Array.from({ length: 7 }, () => ({
      gpx: null,
      participants: [],
      notes: ""
    }));
  }
}

function getWeekDates(offsetWeeks = 0) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const day = today.getDay();
  const mondayDiff = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayDiff + offsetWeeks * 7);

  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function getWeekKey() {
  const monday = getWeekDates(state.weekOffset)[0];
  const y = monday.getFullYear();
  const m = `${monday.getMonth() + 1}`.padStart(2, "0");
  const d = `${monday.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function offsetFromWeekKey(weekKey) {
  const [y, m, d] = weekKey.split("-").map(Number);
  const importedMonday = new Date(y, m - 1, d);
  const currentMonday = getWeekDates(0)[0];
  const diffMs = importedMonday - currentMonday;
  return Math.round(diffMs / (1000 * 60 * 60 * 24 * 7));
}

function formatDate(date) {
  return new Intl.DateTimeFormat("nl-BE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}

ensureWeekData(getWeekKey());
render();
