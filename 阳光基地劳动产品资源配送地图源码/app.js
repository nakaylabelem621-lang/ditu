const initialStations = Array.isArray(window.BASE_STATIONS) ? window.BASE_STATIONS : [];

const defaultDispatchCenter = {
  id: "dispatch-center-201",
  type: "center",
  name: "阳光201调配中心",
  district: "静安区",
  address: "静安区洛川东路201号",
  lat: 31.27159,
  lng: 121.46414,
  description: "负责基地站之间的订单统筹、物料周转和统一调配。",
  contact: "待补充",
  phone: "待补充"
};

const SHANGHAI_MAX_BOUNDS = [
  [29.95, 119.95],
  [32.55, 123.05]
];

const SHANGHAI_VIEW_BOUNDS = [
  [30.72, 121.02],
  [31.66, 121.84]
];

const TYPE_FILTER_KEYS = ["base", "center"];
const HEADER_ALIASES = {
  seq: ["序号", "编号", "序列"],
  district: ["所属区划", "区划", "区域", "所属区域", "地区"],
  name: ["机构名称", "基地名称", "名称", "基站名称", "站点名称", "机构"],
  address: ["机构地址", "地址", "地点"],
  people: ["援助对象人数", "援助对象", "救援对象", "人数", "援助人数"],
  lat: ["lat", "latitude", "纬度", "坐标纬度"],
  lng: ["lng", "longitude", "经度", "坐标经度"],
  type: ["类型", "类别", "点位类型"],
  product: ["劳动产品订单内容", "订单内容", "产品内容", "任务内容"],
  quantity: ["数量"],
  company: ["发单企业", "企业"],
  issueDate: ["发单日期", "下单日期"],
  deliveryDate: ["交付日期", "截止日期"],
  progress: ["完成进度", "进度"],
  contact: ["联系人", "负责人", "联络人", "对接人"],
  phone: ["联系电话", "联系人电话", "电话", "手机号", "手机"]
};

const stationSelect = document.querySelector("#stationSelect");
const currentStationCard = document.querySelector("#currentStationCard");
const showAllBtn = document.querySelector("#showAllBtn");
const focusCurrentBtn = document.querySelector("#focusCurrentBtn");
const liveClock = document.querySelector("#liveClock");
const metricStationCount = document.querySelector("#metricStationCount");
const metricCenterCount = document.querySelector("#metricCenterCount");
const metricDistrictCount = document.querySelector("#metricDistrictCount");
const metricPeopleCount = document.querySelector("#metricPeopleCount");
const filterBaseBtn = document.querySelector("#filterBaseBtn");
const filterCenterBtn = document.querySelector("#filterCenterBtn");
const regionPanelCount = document.querySelector("#regionPanelCount");
const regionAllBtn = document.querySelector("#regionAllBtn");
const regionPanelList = document.querySelector("#regionPanelList");
const uploadFabBtn = document.querySelector("#uploadFabBtn");
const uploadModal = document.querySelector("#uploadModal");
const uploadModalBackdrop = document.querySelector("#uploadModalBackdrop");
const uploadFileInput = document.querySelector("#uploadFileInput");
const uploadSubmitBtn = document.querySelector("#uploadSubmitBtn");
const uploadCancelBtn = document.querySelector("#uploadCancelBtn");
const uploadDismissBtn = document.querySelector("#uploadDismissBtn");
const uploadStatus = document.querySelector("#uploadStatus");

let map;
let baseStations = normalizeStations(initialStations);
let centerEntities = [structuredClone(defaultDispatchCenter)];
let districtEntities = [];
let currentStationId = baseStations[0]?.id || null;
let activeEntityId = currentStationId;
let selectedRegion = "all";
let expandedRegion = null;
let activeTypeFilters = new Set(TYPE_FILTER_KEYS);
const entityMarkers = new Map();
let popupAdjusting = false;
let popupPlacementMode = "auto";

init();

function init() {
  initMap();
  bindEvents();
  refreshApp({ rebuildMarkers: true, fit: true });

  if (liveClock) {
    startClock();
  }
}

function initMap() {
  map = L.map("map", {
    zoomControl: false,
    minZoom: 9
  }).fitBounds(SHANGHAI_VIEW_BOUNDS, getAllRegionFitOptions(false));

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer('https://webrd01.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}', {
    maxZoom: 18,
    attribution: '© 高德地图'
}).addTo(map);

  map.on("popupopen", (event) => {
    map.stop();
    window.requestAnimationFrame(() => {
      positionPopupInSafeArea(event.popup);
    });
  });
}

function bindEvents() {
  if (stationSelect) {
    stationSelect.addEventListener("change", (event) => {
      const nextStation = findStation(event.target.value);

      if (!nextStation) {
        return;
      }

      currentStationId = nextStation.id;
      activeEntityId = nextStation.id;
      selectedRegion = nextStation.district;
      activeTypeFilters.add("base");
      refreshApp({ rebuildMarkers: false, fit: false });
      focusEntity(nextStation.id, { openPopup: false });
    });
  }

  if (showAllBtn) {
    showAllBtn.addEventListener("click", () => {
      selectedRegion = "all";
      activeTypeFilters = new Set(TYPE_FILTER_KEYS);
      refreshApp({ rebuildMarkers: false, fit: true });
    });
  }

  if (focusCurrentBtn) {
    focusCurrentBtn.addEventListener("click", () => {
      focusEntity(currentStationId, { openPopup: true, placement: "center" });
    });
  }

  filterBaseBtn.addEventListener("click", () => {
    toggleCentersFromServiceButton();
  });

  filterCenterBtn.addEventListener("click", () => {
    toggleBasesFromCenterButton();
  });

  if (regionAllBtn) {
    regionAllBtn.addEventListener("click", () => {
      selectedRegion = "all";
      expandedRegion = null;
      refreshApp({ rebuildMarkers: false, fit: true });
    });
  }

  uploadFabBtn.addEventListener("click", openUploadModal);
  uploadModalBackdrop.addEventListener("click", closeUploadModal);
  uploadCancelBtn.addEventListener("click", closeUploadModal);
  uploadDismissBtn.addEventListener("click", closeUploadModal);
  uploadSubmitBtn.addEventListener("click", handleUploadSubmit);

  window.addEventListener("resize", () => {
    window.requestAnimationFrame(() => {
      if (map) {
        map.invalidateSize();
      }
    });
  });
}

function refreshApp({ rebuildMarkers = false, fit = false } = {}) {
  districtEntities = buildDistrictEntities(baseStations);

  if (!baseStations.find((station) => station.id === currentStationId)) {
    currentStationId = baseStations[0]?.id || null;
  }

  if (
    selectedRegion !== "all" &&
    !districtEntities.some((entity) => entity.district === selectedRegion)
  ) {
    selectedRegion = "all";
  }

  const currentStation = findStation(currentStationId);

  if (currentStation && currentStationCard) {
    renderCurrentStation(currentStation);
  }

  if (stationSelect) {
    renderSelectOptions();
  }
  renderRegionPanel();
  renderStaticMetrics();
  syncFilterButtons();

  if (rebuildMarkers) {
    clearMarkers();
    renderMarkers();
  } else {
    updateMarkerIcons();
  }

  applyFilters(fit);
}

function renderSelectOptions() {
  if (!stationSelect) {
    return;
  }

  stationSelect.innerHTML = baseStations
    .map(
      (station) =>
        `<option value="${station.id}">${station.name} · ${station.district}</option>`
    )
    .join("");

  if (currentStationId) {
    stationSelect.value = currentStationId;
  }
}

function renderRegionPanel() {
  if (!regionPanelList || !regionAllBtn) {
    return;
  }

  if (regionPanelCount) {
    regionPanelCount.textContent = `${districtEntities.length} 个区域`;
  }

  if (metricDistrictCount) {
    metricDistrictCount.textContent = String(districtEntities.length);
  }

  regionAllBtn.classList.toggle("is-active", selectedRegion === "all");

  regionPanelList.innerHTML = districtEntities
    .map((entity) => {
      const isActive = selectedRegion === entity.district;
      const isOpen = expandedRegion === entity.district;
      const stationsInDistrict = getStationsByDistrict(entity.district);

      return `
        <section class="region-group ${isActive ? "is-active" : ""} ${isOpen ? "is-open" : ""}">
          <button class="region-group__toggle" type="button" data-district="${entity.district}">
            <span class="region-group__meta">
              <span>${entity.district}</span>
              <span class="region-group__count">(${entity.stationCount})</span>
            </span>
            <span class="region-group__caret">${isOpen ? "▴" : "▾"}</span>
          </button>
          <div class="region-group__bases">
            ${stationsInDistrict
              .map(
                (station) => `
                  <button
                    class="region-base-button ${currentStationId === station.id ? "is-active" : ""}"
                    type="button"
                    data-station-id="${station.id}"
                  >
                    ${station.name}
                  </button>
                `
              )
              .join("")}
          </div>
        </section>
      `;
    })
    .join("");

  regionPanelList.querySelectorAll("[data-district]").forEach((button) => {
    button.addEventListener("click", () => {
      const district = button.dataset.district;
      selectedRegion = district;
      expandedRegion = expandedRegion === district ? null : district;
      refreshApp({ rebuildMarkers: false, fit: true });
    });
  });

  regionPanelList.querySelectorAll("[data-station-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const station = findStation(button.dataset.stationId);

      if (!station) {
        return;
      }

      currentStationId = station.id;
      activeEntityId = station.id;
      selectedRegion = station.district;
      expandedRegion = station.district;
      activeTypeFilters.add("base");
      refreshApp({ rebuildMarkers: false, fit: false });
      focusEntity(station.id, { openPopup: true, placement: "center" });
    });
  });
}

function renderStaticMetrics() {
  const regionalStations = getRegionFilteredStations();
  const regionalCenters = getRegionFilteredCenters();

  metricStationCount.textContent = String(regionalStations.length);
  metricCenterCount.textContent = String(regionalCenters.length);
  metricPeopleCount.textContent = String(
    regionalStations.reduce((sum, station) => sum + (station.people || 0), 0)
  );
}

function renderCurrentStation(station) {
  if (!currentStationCard) {
    return;
  }

  currentStationCard.innerHTML = `
    <article class="current-station-card__inner">
      <div class="current-station-card__meta">
        <span>${station.district} · 第 ${station.seq} 个基地站</span>
        <span class="pill pill--current">我的点位</span>
      </div>
      <h3>${station.name}</h3>
      <p>${station.address}</p>
      <p>援助对象人数 ${station.people} 人${station.workSample ? "，已配置工作任务。" : "。"} </p>
    </article>
  `;
}

function renderMarkers() {
  baseStations.forEach((station) => {
    const marker = L.marker([station.lat, station.lng], {
      icon: createMarkerIcon(station.id === currentStationId ? "current" : "base"),
      title: station.name,
      keyboard: true
    })
      .bindPopup(buildStationPopup(station), {
        autoPan: false,
        autoPanPadding: [30, 30],
        maxWidth: 420
      })
      .on("click", () => {
        activeEntityId = station.id;
        updateMarkerIcons();
      });

    entityMarkers.set(station.id, marker);
  });

  centerEntities.forEach((center) => {
    const marker = L.marker([center.lat, center.lng], {
      icon: createMarkerIcon("center"),
      title: center.name,
      keyboard: true
    })
      .bindPopup(buildDispatchCenterPopup(center), {
        autoPan: false,
        autoPanPadding: [30, 30],
        maxWidth: 420
      })
      .on("click", () => {
        activeEntityId = center.id;
      });

    entityMarkers.set(center.id, marker);
  });
}

function clearMarkers() {
  entityMarkers.forEach((marker) => marker.remove());
  entityMarkers.clear();
}

function updateMarkerIcons() {
  entityMarkers.forEach((marker, entityId) => {
    const entity = findEntity(entityId);
    const type = getEntityType(entity);

    if (type === "center") {
      marker.setIcon(createMarkerIcon("center"));
      return;
    }

    marker.setIcon(
      createMarkerIcon(entityId === currentStationId ? "current" : "base")
    );
  });
}

function toggleCentersFromServiceButton() {
  activeTypeFilters.add("base");

  if (activeTypeFilters.has("center")) {
    activeTypeFilters.delete("center");
  } else {
    activeTypeFilters.add("center");
  }

  syncFilterButtons();
  applyFilters(true);
}

function toggleBasesFromCenterButton() {
  activeTypeFilters.add("center");

  if (activeTypeFilters.has("base")) {
    activeTypeFilters.delete("base");
  } else {
    activeTypeFilters.add("base");
  }

  syncFilterButtons();
  applyFilters(true);
}

function syncFilterButtons() {
  updateFilterButton(filterBaseBtn, activeTypeFilters.has("base"));
  updateFilterButton(filterCenterBtn, activeTypeFilters.has("center"));
}

function updateFilterButton(button, isActive) {
  button.classList.toggle("is-active", isActive);
  button.setAttribute("aria-pressed", String(isActive));
}

function applyFilters(shouldFit = false) {
  entityMarkers.forEach((marker, entityId) => {
    const entity = findEntity(entityId);
    const shouldShow = shouldShowEntity(entity);
    const onMap = map.hasLayer(marker);

    if (shouldShow && !onMap) {
      marker.addTo(map);
    }

    if (!shouldShow && onMap) {
      marker.remove();
    }
  });

  const activeEntity = findEntity(activeEntityId);

  if (activeEntity && !shouldShowEntity(activeEntity)) {
    const fallback = getVisibleEntities()[0];

    if (fallback) {
      activeEntityId = fallback.id;
    }
  }

  if (shouldFit) {
    fitVisibleEntities();
  }
}

function shouldShowEntity(entity) {
  const type = getEntityType(entity);

  if (type === "center") {
    return (
      activeTypeFilters.has("center") &&
      (selectedRegion === "all" || entity.district === selectedRegion)
    );
  }

  return (
    activeTypeFilters.has("base") &&
    (selectedRegion === "all" || entity.district === selectedRegion)
  );
}

function fitAllStations() {
  selectedRegion = "all";
  activeTypeFilters = new Set(TYPE_FILTER_KEYS);
  syncFilterButtons();
  refreshApp({ rebuildMarkers: false, fit: true });
}

function positionPopupInSafeArea(popup) {
  if (!popup || !map) {
    return;
  }

  if (popupAdjusting) {
    return;
  }

  const popupElement = popup.getElement();

  if (!popupElement) {
    popupPlacementMode = "auto";
    return;
  }

  const mapRect = map.getContainer().getBoundingClientRect();
  const safeRect = getPopupSafeRect(mapRect);
  const popupRect = popupElement.getBoundingClientRect();
  const desktopLayout = window.innerWidth >= 1100;
  const forceCenter = popupPlacementMode === "center" || selectedRegion === "all";

  let desiredShiftX = 0;
  let desiredShiftY = 0;

  if (desktopLayout) {
    const safeTargetX = safeRect.left + (safeRect.right - safeRect.left) * 0.5;
    const safeTargetY =
      forceCenter
        ? safeRect.top + (safeRect.bottom - safeRect.top) * 0.5
        : safeRect.top + (safeRect.bottom - safeRect.top) * 0.44;
    const popupCenterX = popupRect.left + popupRect.width / 2;
    const popupCenterY = popupRect.top + popupRect.height / 2;

    desiredShiftX = safeTargetX - popupCenterX;
    desiredShiftY = safeTargetY - popupCenterY;
  } else {
    if (popupRect.left < safeRect.left) {
      desiredShiftX = safeRect.left - popupRect.left;
    } else if (popupRect.right > safeRect.right) {
      desiredShiftX = safeRect.right - popupRect.right;
    }

    if (popupRect.top < safeRect.top) {
      desiredShiftY = safeRect.top - popupRect.top;
    } else if (popupRect.bottom > safeRect.bottom) {
      desiredShiftY = safeRect.bottom - popupRect.bottom;
    }
  }

  if (Math.abs(desiredShiftX) < 1 && Math.abs(desiredShiftY) < 1) {
    popupPlacementMode = "auto";
    return;
  }

  popupAdjusting = true;
  map.panBy([-desiredShiftX, -desiredShiftY], {
    animate: false
  });
  popupAdjusting = false;
  popupPlacementMode = "auto";
}

function getPopupSafeRect(mapRect) {
  const leftPanel = document.querySelector(".floating-region-panel");
  const topMetrics = document.querySelector(".floating-topbar--metrics-only");

  const leftInset = leftPanel
    ? Math.max(36, leftPanel.getBoundingClientRect().right - mapRect.left + 36)
    : 36;

  const topInset = topMetrics
    ? Math.max(36, topMetrics.getBoundingClientRect().bottom - mapRect.top + 24)
    : 36;

  return {
    left: mapRect.left + leftInset,
    top: mapRect.top + topInset,
    right: mapRect.right - 36,
    bottom: mapRect.bottom - 36
  };
}

function getAllRegionFitOptions(animate) {
  const leftPanel = document.querySelector(".floating-region-panel");
  const topMetrics = document.querySelector(".floating-topbar--metrics-only");
  const paddingTopLeft = [
    leftPanel ? leftPanel.getBoundingClientRect().width + 48 : 48,
    topMetrics ? topMetrics.getBoundingClientRect().height + 36 : 48
  ];

  return {
    paddingTopLeft,
    paddingBottomRight: [56, 56],
    animate,
    duration: animate ? 0.75 : 0
  };
}

function fitVisibleEntities() {
  const visibleEntities = getVisibleEntities();

  if (!visibleEntities.length) {
    return;
  }

  if (selectedRegion === "all") {
    map.fitBounds(SHANGHAI_VIEW_BOUNDS, getAllRegionFitOptions(false));
    return;
  }

  if (visibleEntities.length === 1) {
    const [entity] = visibleEntities;
    map.flyTo([entity.lat, entity.lng], 12.5, { duration: 0.6 });
    return;
  }

  const bounds = L.latLngBounds(visibleEntities.map((entity) => [entity.lat, entity.lng]));
  map.fitBounds(bounds.pad(0.08), { animate: true, duration: 0.75 });
}

function focusEntity(entityId, options = {}) {
  const entity = findEntity(entityId);
  const { openPopup = false, placement = "auto" } = options;

  if (!entity) {
    return;
  }

  selectedRegion = entity.district || "all";

  if (getEntityType(entity) === "base") {
    expandedRegion = entity.district;
  }

  if (getEntityType(entity) !== "district") {
    activeTypeFilters.add(getEntityType(entity));
  }

  refreshApp({ rebuildMarkers: false, fit: false });

  const marker = entityMarkers.get(entityId);
  popupPlacementMode = placement;
  map.stop();

  if (openPopup && marker) {
    activeEntityId = entityId;
    map.once("moveend", () => {
      marker.openPopup();
    });
  }

  map.flyTo([entity.lat, entity.lng], 13, {
    duration: openPopup ? 0.45 : 0.7
  });

  if (!openPopup) {
    popupPlacementMode = "auto";
  }
}

function createMarkerIcon(mode) {
  const classes = ["station-marker", `station-marker--${mode}`]
    .filter(Boolean)
    .join(" ");

  const fill =
    mode === "center"
      ? "#eb4d79"
      : "#45c3ff";

  const stroke =
    mode === "current"
      ? "#ff9f56"
      : "rgba(255,255,255,0.96)";

  return L.divIcon({
    className: "",
    html: `
      <div class="${classes}">
        <svg viewBox="0 0 40 52" aria-hidden="true">
          <path
            d="M20 2C10.611 2 3 9.611 3 19c0 12.156 14.788 25.357 15.418 25.914a2.5 2.5 0 0 0 3.164 0C22.212 44.357 37 31.156 37 19 37 9.611 29.389 2 20 2Z"
            fill="${fill}"
            stroke="${stroke}"
            stroke-width="${mode === "current" ? "3.5" : "2.5"}"
          />
          <circle cx="20" cy="18" r="6.2" fill="#ffffff" />
        </svg>
      </div>
    `,
    iconSize: [32, 42],
    iconAnchor: [16, 36],
    popupAnchor: [0, -34]
  });
}

function buildStationPopup(station) {
  const contact = station.contact || "待补充";
  const phone = station.phone || "待补充";
  const baseInfoSection = `
    <div class="station-popup__column">
      <p class="station-popup__section-title">基地信息</p>
      <div class="popup-info-list">
        <article class="popup-info-item">
          <span class="popup-info-item__label">序号</span>
          <strong>${station.seq}</strong>
        </article>
        <article class="popup-info-item">
          <span class="popup-info-item__label">所属区划</span>
          <strong>${station.district}</strong>
        </article>
        <article class="popup-info-item popup-info-item--wide">
          <span class="popup-info-item__label">机构名称</span>
          <strong>${station.name}</strong>
        </article>
        <article class="popup-info-item popup-info-item--wide">
          <span class="popup-info-item__label">机构地址</span>
          <strong>${station.address}</strong>
        </article>
        <article class="popup-info-item">
          <span class="popup-info-item__label">援助对象人数</span>
          <strong>${station.people} 人</strong>
        </article>
      </div>
    </div>
  `;

  const workSampleSection = station.workSample
    ? `
      <div class="station-popup__column">
        <p class="station-popup__section-title">工作任务</p>
        <section class="popup-work-card">
          <h4>${station.workSample.product}</h4>
          <div class="popup-work-grid">
            <article class="popup-work-item">
              <span class="popup-work-item__label">数量</span>
              <strong>${station.workSample.quantity}</strong>
            </article>
            <article class="popup-work-item">
              <span class="popup-work-item__label">发单企业</span>
              <strong>${station.workSample.company}</strong>
            </article>
            <article class="popup-work-item">
              <span class="popup-work-item__label">发单日期</span>
              <strong>${station.workSample.issueDate}</strong>
            </article>
            <article class="popup-work-item">
              <span class="popup-work-item__label">交付日期</span>
              <strong>${station.workSample.deliveryDate}</strong>
            </article>
            <article class="popup-work-item popup-work-item--wide">
              <span class="popup-work-item__label">完成进度</span>
              <strong>${station.workSample.progress}</strong>
            </article>
          </div>
        </section>
      </div>
    `
    : "";

  return `
    <div class="station-popup ${station.workSample ? "station-popup--with-task" : "station-popup--info-only"}">
      <div class="station-popup__top">
        <div>
          <h3>${station.name}</h3>
          <p class="station-popup__address">${station.address}</p>
        </div>
      </div>
      <div class="station-popup__meta">
        <span class="pill pill--district">${station.district}</span>
        <span class="pill pill--stable">援助对象 ${station.people} 人</span>
      </div>
      <div class="popup-info-list popup-info-list--contact">
        <article class="popup-info-item">
          <span class="popup-info-item__label">联系人</span>
          <strong>${contact}</strong>
        </article>
        <article class="popup-info-item">
          <span class="popup-info-item__label">联系电话</span>
          <strong>${phone}</strong>
        </article>
      </div>
      <div class="station-popup__body ${station.workSample ? "station-popup__body--split" : "station-popup__body--single"}">
        ${baseInfoSection}
        ${workSampleSection}
      </div>
    </div>
  `;
}

function buildDispatchCenterPopup(center) {
  const contact = center.contact || "待补充";
  const phone = center.phone || "待补充";
  return `
    <div class="station-popup station-popup--info-only">
      <div class="station-popup__top">
        <div>
          <h3>${center.name}</h3>
          <p class="station-popup__address">${center.address}</p>
        </div>
      </div>
      <div class="station-popup__meta">
        <span class="pill pill--district">${center.district}</span>
        <span class="pill pill--center">调配中心</span>
      </div>
      <div class="popup-info-list popup-info-list--contact">
        <article class="popup-info-item">
          <span class="popup-info-item__label">联系人</span>
          <strong>${contact}</strong>
        </article>
        <article class="popup-info-item">
          <span class="popup-info-item__label">联系电话</span>
          <strong>${phone}</strong>
        </article>
      </div>
      <div class="station-popup__body station-popup__body--single">
        <div class="station-popup__column">
          <p class="station-popup__section-title">中心信息</p>
          <div class="popup-info-list">
            <article class="popup-info-item">
              <span class="popup-info-item__label">所属区划</span>
              <strong>${center.district}</strong>
            </article>
            <article class="popup-info-item">
              <span class="popup-info-item__label">定位类型</span>
              <strong>调配中心</strong>
            </article>
            <article class="popup-info-item popup-info-item--wide">
              <span class="popup-info-item__label">名称</span>
              <strong>${center.name}</strong>
            </article>
            <article class="popup-info-item popup-info-item--wide">
              <span class="popup-info-item__label">中心地址</span>
              <strong>${center.address}</strong>
            </article>
            <article class="popup-info-item popup-info-item--wide">
              <span class="popup-info-item__label">职责说明</span>
              <strong>${center.description}</strong>
            </article>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildDistrictPopup(entity) {
  const stationNames = entity.stationNames.slice(0, 6).join("、");
  const suffix = entity.stationNames.length > 6 ? ` 等 ${entity.stationNames.length} 个基地站` : "";

  return `
    <div class="station-popup">
      <div class="station-popup__top">
        <div>
          <h3>${entity.name}</h3>
          <p class="station-popup__address">区划聚合点位，用来查看该区域覆盖的基地站情况。</p>
        </div>
      </div>
      <div class="station-popup__meta">
        <span class="pill pill--district">${entity.district}</span>
        <span class="pill pill--stable">基地站 ${entity.stationCount} 个</span>
        <span class="pill pill--stable">援助对象 ${entity.peopleTotal} 人</span>
      </div>
      <div class="station-popup__body station-popup__body--single">
        <div class="station-popup__column">
          <p class="station-popup__section-title">覆盖情况</p>
          <div class="popup-info-list">
            <article class="popup-info-item">
              <span class="popup-info-item__label">覆盖区划</span>
              <strong>${entity.district}</strong>
            </article>
            <article class="popup-info-item">
              <span class="popup-info-item__label">基地站数量</span>
              <strong>${entity.stationCount} 个</strong>
            </article>
            <article class="popup-info-item">
              <span class="popup-info-item__label">援助对象总人数</span>
              <strong>${entity.peopleTotal} 人</strong>
            </article>
            <article class="popup-info-item popup-info-item--wide">
              <span class="popup-info-item__label">基地站清单</span>
              <strong>${stationNames}${suffix}</strong>
            </article>
          </div>
        </div>
      </div>
    </div>
  `;
}

function buildDistrictEntities(stationsInput) {
  const districtMap = new Map();

  stationsInput.forEach((station) => {
    const existing = districtMap.get(station.district) || {
      id: `district-${station.district}`,
      type: "district",
      district: station.district,
      name: `${station.district}覆盖区划`,
      latSum: 0,
      lngSum: 0,
      stationCount: 0,
      peopleTotal: 0,
      stationNames: []
    };

    existing.latSum += station.lat;
    existing.lngSum += station.lng;
    existing.stationCount += 1;
    existing.peopleTotal += station.people || 0;
    existing.stationNames.push(station.name);

    districtMap.set(station.district, existing);
  });

  return Array.from(districtMap.values()).map((item) => ({
    id: item.id,
    type: item.type,
    district: item.district,
    name: item.name,
    lat: item.latSum / item.stationCount,
    lng: item.lngSum / item.stationCount,
    stationCount: item.stationCount,
    peopleTotal: item.peopleTotal,
    stationNames: item.stationNames
  }));
}

function getRegionFilteredStations() {
  return baseStations.filter(
    (station) => selectedRegion === "all" || station.district === selectedRegion
  );
}

function getRegionFilteredCenters() {
  return centerEntities.filter(
    (center) => selectedRegion === "all" || center.district === selectedRegion
  );
}

function getStationsByDistrict(district) {
  return baseStations.filter((station) => station.district === district);
}

function getVisibleEntities() {
  return [
    ...baseStations.filter((station) => shouldShowEntity(station)),
    ...centerEntities.filter((center) => shouldShowEntity(center))
  ];
}

function normalizeStations(stationsInput) {
  return stationsInput.map((station, index) => ({
    ...structuredClone(station),
    type: "base",
    seq: station.seq || index + 1,
    people: Number(station.people || 0),
    contact: station.contact || "待补充",
    phone: station.phone || "待补充"
  }));
}

function getEntityType(entity) {
  if (!entity) {
    return null;
  }

  return entity.type || "base";
}

function findStation(id) {
  return baseStations.find((station) => station.id === id);
}

function findEntity(id) {
  return (
    baseStations.find((station) => station.id === id) ||
    centerEntities.find((center) => center.id === id) ||
    districtEntities.find((entity) => entity.id === id) ||
    null
  );
}

function openUploadModal() {
  uploadModal.hidden = false;
  uploadStatus.textContent = "";
}

function closeUploadModal() {
  uploadModal.hidden = true;
  uploadStatus.textContent = "";
  uploadFileInput.value = "";
}

async function handleUploadSubmit() {
  const file = uploadFileInput.files?.[0];

  if (!file) {
    uploadStatus.textContent = "请先选择一个 Excel 表格。";
    return;
  }

  if (!window.XLSX) {
    uploadStatus.textContent = "当前页面未成功加载 Excel 解析库，请稍后重试。";
    return;
  }

  try {
    uploadStatus.textContent = "正在读取并匹配表格内容，请稍候…";

    const buffer = await file.arrayBuffer();
    const workbook = window.XLSX.read(buffer, { type: "array" });
    const sheetName = workbook.SheetNames[0];

    if (!sheetName) {
      uploadStatus.textContent = "表格里没有可读取的工作表。";
      return;
    }

    const sheet = workbook.Sheets[sheetName];
    const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: "" });
    const parsedRows = rows.map(parseUploadRow).filter(Boolean);

    if (!parsedRows.length) {
      uploadStatus.textContent = "没有识别到可用的基地站信息。";
      return;
    }

    const result = mergeUploadedRows(parsedRows);
    refreshApp({ rebuildMarkers: true, fit: true });
    uploadStatus.textContent = `处理完成：更新 ${result.updated} 条，新增 ${result.added} 条，跳过 ${result.skipped} 条。`;
  } catch (error) {
    uploadStatus.textContent = `上传失败：${error.message || "未知错误"}`;
  }
}

function parseUploadRow(row) {
  const fieldMap = buildNormalizedRowMap(row);
  const name = getFieldValue(fieldMap, HEADER_ALIASES.name);
  const address = getFieldValue(fieldMap, HEADER_ALIASES.address);
  const district = getFieldValue(fieldMap, HEADER_ALIASES.district);

  if (!name && !address) {
    return null;
  }

  const latValue = getFieldValue(fieldMap, HEADER_ALIASES.lat);
  const lngValue = getFieldValue(fieldMap, HEADER_ALIASES.lng);
  const typeValue = getFieldValue(fieldMap, HEADER_ALIASES.type);
  const product = getFieldValue(fieldMap, HEADER_ALIASES.product);
  const quantity = getFieldValue(fieldMap, HEADER_ALIASES.quantity);
  const company = getFieldValue(fieldMap, HEADER_ALIASES.company);
  const issueDate = getFieldValue(fieldMap, HEADER_ALIASES.issueDate);
  const deliveryDate = getFieldValue(fieldMap, HEADER_ALIASES.deliveryDate);
  const progress = getFieldValue(fieldMap, HEADER_ALIASES.progress);
  const contact = getFieldValue(fieldMap, HEADER_ALIASES.contact);
  const phone = getFieldValue(fieldMap, HEADER_ALIASES.phone);

  return {
    seq: parseOptionalNumber(getFieldValue(fieldMap, HEADER_ALIASES.seq)),
    district: district || "",
    name: name || "",
    address: address || "",
    people: parseOptionalNumber(getFieldValue(fieldMap, HEADER_ALIASES.people)) || 0,
    lat: parseOptionalNumber(latValue),
    lng: parseOptionalNumber(lngValue),
    type: inferUploadedType(typeValue, name),
    contact: contact || "",
    phone: phone || "",
    workSample:
      product || quantity || company || issueDate || deliveryDate || progress
        ? {
            product: product || "未命名任务",
            quantity: quantity || "—",
            company: company || "—",
            issueDate: issueDate || "—",
            deliveryDate: deliveryDate || "—",
            progress: progress || "—"
          }
        : null
  };
}

function mergeUploadedRows(rows) {
  let updated = 0;
  let added = 0;
  let skipped = 0;

  rows.forEach((row) => {
    if (row.type === "center") {
      const matchedCenter = findMatchingCenter(row);

      if (matchedCenter) {
        mergeEntity(matchedCenter, row);
        updated += 1;
        return;
      }

      if (row.lat != null && row.lng != null) {
        centerEntities.push({
          id: `upload-center-${Date.now()}-${added + 1}`,
          type: "center",
          name: row.name,
          district: row.district || "未分区",
          address: row.address || "",
          lat: row.lat,
          lng: row.lng,
          description: "通过 Excel 上传新增的调配中心点位。",
          contact: row.contact || "待补充",
          phone: row.phone || "待补充"
        });
        added += 1;
      } else {
        skipped += 1;
      }

      return;
    }

    const matchedStation = findMatchingStation(row);

    if (matchedStation) {
      mergeEntity(matchedStation, row);
      updated += 1;
      return;
    }

    if (row.lat != null && row.lng != null) {
      baseStations.push({
        id: `upload-base-${Date.now()}-${added + 1}`,
        type: "base",
        seq: row.seq || getNextStationSeq(),
        district: row.district || "未分区",
        name: row.name || "新增基地站",
        address: row.address || "",
        people: row.people || 0,
        contact: row.contact || "待补充",
        phone: row.phone || "待补充",
        lat: row.lat,
        lng: row.lng,
        workSample: row.workSample || null
      });
      added += 1;
    } else {
      skipped += 1;
    }
  });

  return { updated, added, skipped };
}

function mergeEntity(target, source) {
  if (source.seq != null) {
    target.seq = source.seq;
  }

  if (source.district) {
    target.district = source.district;
  }

  if (source.name) {
    target.name = source.name;
  }

  if (source.address) {
    target.address = source.address;
  }

  if (source.people != null) {
    target.people = source.people;
  }

  if (source.contact) {
    target.contact = source.contact;
  }

  if (source.phone) {
    target.phone = source.phone;
  }

  if (source.lat != null) {
    target.lat = source.lat;
  }

  if (source.lng != null) {
    target.lng = source.lng;
  }

  if (source.workSample) {
    target.workSample = {
      ...(target.workSample || {}),
      ...source.workSample
    };
  }
}

function findMatchingStation(row) {
  const rowName = normalizeMatchValue(row.name);
  const rowAddress = normalizeMatchValue(row.address);
  const rowDistrict = normalizeMatchValue(row.district);

  return baseStations.find((station) => {
    const stationName = normalizeMatchValue(station.name);
    const stationAddress = normalizeMatchValue(station.address);
    const stationDistrict = normalizeMatchValue(station.district);

    return (
      (rowName && rowName === stationName) ||
      (rowAddress && rowDistrict && rowAddress === stationAddress && rowDistrict === stationDistrict) ||
      (rowName && rowAddress && rowName === stationName && rowAddress === stationAddress)
    );
  });
}

function findMatchingCenter(row) {
  const rowName = normalizeMatchValue(row.name);
  const rowAddress = normalizeMatchValue(row.address);

  return centerEntities.find((center) => {
    const centerName = normalizeMatchValue(center.name);
    const centerAddress = normalizeMatchValue(center.address);

    return (
      (rowName && rowName === centerName) ||
      (rowAddress && rowAddress === centerAddress)
    );
  });
}

function buildNormalizedRowMap(row) {
  return Object.entries(row).map(([key, value]) => ({
    normalizedKey: normalizeHeaderKey(key),
    value
  }));
}

function getFieldValue(fieldMap, aliases) {
  const aliasKeys = aliases.map(normalizeHeaderKey);
  const match = fieldMap.find((entry) => aliasKeys.includes(entry.normalizedKey));
  return match?.value ?? "";
}

function normalizeHeaderKey(text) {
  return String(text)
    .replace(/\s+/g, "")
    .replace(/[（）()]/g, "")
    .toLowerCase();
}

function normalizeMatchValue(text) {
  return String(text || "")
    .replace(/\s+/g, "")
    .replace(/[（）()·,.，。]/g, "")
    .toLowerCase();
}

function inferUploadedType(typeValue, nameValue) {
  const text = `${typeValue || ""}${nameValue || ""}`;
  return text.includes("调配") || text.includes("中心") ? "center" : "base";
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const numeric = Number(String(value).replace(/[^\d.-]/g, ""));
  return Number.isFinite(numeric) ? numeric : null;
}

function getNextStationSeq() {
  return baseStations.reduce((max, station) => Math.max(max, station.seq || 0), 0) + 1;
}

function startClock() {
  updateClock();
  window.setInterval(updateClock, 1000);
}

function updateClock() {
  if (liveClock) {
    liveClock.textContent = new Date().toLocaleTimeString("zh-CN", {
      hour12: false
    });
  }
}
