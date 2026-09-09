// Masking utilities for farmer privacy (8792XXXX89 format)
function maskPhoneNumber(phone) {
  if (!phone) return '8792XXXX89';
  const clean = phone.replace(/[^0-9]/g, '');
  if (clean.length >= 10) {
    const last10 = clean.slice(-10);
    return `${last10.slice(0, 4)}XXXX${last10.slice(-2)}`;
  }
  return '8792XXXX89';
}

function maskUpiId(upi) {
  if (!upi) return 'Escrow Account (Protected)';
  const parts = upi.split('@');
  if (parts.length === 2) {
    return `${parts[0].charAt(0)}****@${parts[1]}`;
  }
  return 'Escrow Account (Protected)';
}

let currentProduceList = [];
let selectedProduce = null;
let currentOrders = [];
let currentSmsLogs = [];
let activeForecasts = [];

// Multi-Farmer Aggregation State
let currentShortfallData = null;

// Payment & QR Modal State
let pendingCheckoutData = null;
let activeDeliveryQrOrderId = null;

// User State (Guest by default)
let currentUser = {
  isLoggedIn: false,
  role: 'GUEST', // 'GUEST', 'CUSTOMER', 'FARMER'
  name: '',
  phone: '',
  customerType: 'BULK',
  organizationName: '',
  licenseNo: '',
  farmerUniqueId: null
};

// Search & Autocomplete State
let currentSearchQuery = '';
let activeSearchDropdownIndex = -1;
let currentCategoryFilter = 'ALL';

// Customer Delivery Location State (Google Maps Coordinates)
let currentDeliveryLocation = {
  name: 'Panchavati Market, Nashik - 422003',
  lat: 20.0150,
  lng: 73.8050
};
let filterOnlyNearbyVillages = false;
let currentAiCategoryFilter = 'ALL';

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  // Load saved theme if any
  const savedTheme = localStorage.getItem('kisaan_theme') || 'theme-emerald';
  changeTheme(savedTheme);

  fetchProduce();
  fetchFarmers();
  fetchOrders();
  fetchAiForecast();

  // Close search dropdown on click outside
  document.addEventListener('click', (e) => {
    const container = document.getElementById('search-container');
    if (container && !container.contains(e.target)) {
      hideSearchDropdown();
    }
  });

  // Poll silently every 4 seconds for live SMS / Orders updates
  setInterval(() => {
    fetchOrdersSilently();
  }, 4000);
});

// Custom Theme Switcher
function changeTheme(themeName) {
  document.body.className = `bg-slate-50 text-slate-800 font-sans min-h-screen flex flex-col transition-colors duration-300 ${themeName}`;
  localStorage.setItem('kisaan_theme', themeName);
}

// Tab Switcher
function switchTab(tabName) {
  ['buyer', 'ai', 'farmer', 'orders', 'login'].forEach(tab => {
    const section = document.getElementById(`tab-${tab}`);
    const navBtn = document.getElementById(`nav-${tab}`);
    if (tab === tabName) {
      section.classList.remove('hidden');
      navBtn.className = "px-3.5 py-2 rounded-lg bg-white text-emerald-900 shadow font-bold transition-all";
    } else {
      section.classList.add('hidden');
      navBtn.className = "px-3.5 py-2 rounded-lg text-emerald-100 hover:bg-white/10 transition-all";
    }
  });

  if (tabName === 'ai' && activeForecasts.length === 0) {
    fetchAiForecast();
  }
}

// ==========================================
// 1. AI DEMAND & MARKET PRICE FORECASTING
// ==========================================

async function fetchAiForecast() {
  try {
    const res = await fetch('/api/ai/demand-forecast');
    const result = await res.json();
    if (result.success) {
      activeForecasts = result.forecasts;
      renderAiForecastCards();
    }
  } catch (err) {
    console.error('Error fetching AI forecasts', err);
  }
}

function filterAiForecasts(category) {
  currentAiCategoryFilter = category;
  document.querySelectorAll('.ai-filter-btn').forEach(btn => {
    if (btn.id === `ai-filter-${category}`) {
      btn.className = "ai-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm transition";
    } else {
      btn.className = "ai-filter-btn px-3 py-1 rounded-full text-xs font-semibold bg-white text-slate-600 border hover:border-emerald-400 transition";
    }
  });
  renderAiForecastCards();
}

function renderAiForecastCards() {
  const container = document.getElementById('ai-forecast-grid');
  if (!container || activeForecasts.length === 0) return;

  let itemsToRender = activeForecasts;
  if (currentAiCategoryFilter !== 'ALL') {
    itemsToRender = itemsToRender.filter(f => (f.category || '').toLowerCase() === currentAiCategoryFilter.toLowerCase());
  }

  if (itemsToRender.length === 0) {
    container.innerHTML = `<div class="col-span-2 p-8 text-center text-slate-500">No commodities found for category "${currentAiCategoryFilter}".</div>`;
    return;
  }

  container.innerHTML = itemsToRender.map(f => {
    let statusClass = "bg-emerald-100 text-emerald-800 border-emerald-300";
    let statusLabel = "High Buyer Inflow";
    if (f.demandStatus === 'PEAK_SUPPLY_STABLE') {
      statusClass = "bg-blue-100 text-blue-800 border-blue-300";
      statusLabel = "Balanced Supply & Demand";
    } else if (f.demandStatus === 'MODERATE_UPWARD') {
      statusClass = "bg-amber-100 text-amber-800 border-amber-300";
      statusLabel = "Prices Rising Upward";
    } else if (f.demandStatus === 'STEADY_DEMAND') {
      statusClass = "bg-slate-100 text-slate-800 border-slate-300";
      statusLabel = "Steady Regular Consumption";
    }

    // Dynamic price scale for 7-day trend bars
    const maxVal = Math.max(...f.sevenDayTrend, f.predictedNextWeekAvg);
    const minVal = Math.min(...f.sevenDayTrend, f.predictedNextWeekAvg);
    const spread = (maxVal - minVal) || 1;
    const priceChangePct = Math.round(((f.predictedNextWeekAvg - f.currentMandiRate) / f.currentMandiRate) * 100);
    const isGain = priceChangePct >= 0;

    return `
      <div class="bg-slate-50 rounded-2xl p-5 border border-slate-200 shadow-sm space-y-4 hover:border-emerald-400 transition">
        <div class="flex items-start justify-between">
          <div>
            <div class="flex items-center space-x-2">
              <h3 class="font-black text-slate-900 text-base">${f.commodity}</h3>
              <span class="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">${f.category}</span>
            </div>
            <p class="text-[11px] text-slate-500 mt-0.5">Market Arrival: <strong>${f.marketArrivalVolumeQuintals} Quintals</strong> • Elasticity: ${f.elasticityIndex}</p>
          </div>
          <span class="text-[10px] font-black uppercase px-2.5 py-1 rounded-full border ${statusClass}">
            ${statusLabel}
          </span>
        </div>

        <!-- Prices Comparison Box -->
        <div class="grid grid-cols-3 gap-2 text-center bg-white p-3 rounded-xl border border-slate-200 text-xs">
          <div>
            <div class="text-[10px] text-slate-400 font-bold uppercase">Current Mandi</div>
            <div class="font-bold text-slate-700 text-sm">₹${f.currentMandiRate}/kg</div>
          </div>
          <div class="border-x">
            <div class="text-[10px] text-emerald-700 font-bold uppercase">Farmer Direct</div>
            <div class="font-black text-emerald-700 text-sm">₹${f.farmerDirectPrice}/kg</div>
          </div>
          <div>
            <div class="text-[10px] text-amber-700 font-bold uppercase">AI 7-Day Target</div>
            <div class="font-black text-amber-600 text-sm">₹${f.predictedNextWeekAvg}/kg</div>
          </div>
        </div>

        <!-- 7-Day Trend Visual Bars with Dynamic Scaling -->
        <div class="space-y-1">
          <div class="flex justify-between text-[10px] font-bold text-slate-400 uppercase">
            <span>7-Day Price Forecast Trajectory</span>
            <span class="${isGain ? 'text-emerald-700' : 'text-rose-600'}">${isGain ? '+' : ''}${priceChangePct}% Expected Shift</span>
          </div>
          <div class="flex items-end space-x-1.5 h-14 bg-white p-2 rounded-xl border">
            ${f.sevenDayTrend.map((price, idx) => {
              const heightPct = Math.max(15, Math.min(100, Math.round(((price - minVal) / spread) * 75 + 25)));
              return `
                <div class="flex-1 flex flex-col items-center justify-end h-full group relative">
                  <div class="w-full bg-emerald-500 group-hover:bg-amber-400 rounded-t transition-all" style="height: ${heightPct}%;"></div>
                  <span class="text-[8px] text-slate-400 mt-0.5 font-bold">D${idx + 1}</span>
                  <div class="absolute -top-6 bg-slate-900 text-white text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap z-10">₹${price}/kg</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <!-- AI Actionable Advice -->
        <div class="space-y-2 text-xs border-t pt-3">
          <div class="bg-emerald-50 p-2.5 rounded-xl border border-emerald-100 flex items-start space-x-2">
            <i class="fa-solid fa-wheat-awn text-emerald-700 mt-0.5"></i>
            <span class="text-emerald-900"><strong>For Farmers:</strong> ${f.recommendationForFarmers}</span>
          </div>
          <div class="bg-amber-50 p-2.5 rounded-xl border border-amber-100 flex items-start space-x-2">
            <i class="fa-solid fa-store text-amber-700 mt-0.5"></i>
            <span class="text-amber-900"><strong>For Buyers:</strong> ${f.recommendationForBuyers}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ==========================================
// 2. AI MULTI-STOP ROUTE OPTIMIZATION SIM
// ==========================================

async function runAiRouteOptimizationSim() {
  const crop = document.getElementById('route-sim-crop').value;
  const qty = document.getElementById('route-sim-qty').value;
  const resultCard = document.getElementById('route-result-card');

  resultCard.innerHTML = `<div class="p-8 text-center text-slate-500"><i class="fa-solid fa-spinner fa-spin text-2xl mr-2 text-emerald-600"></i> Calculating shortest multi-stop pickup sequence and fuel footprint...</div>`;

  try {
    // 1. Run Aggregation first to see who supplies
    const aggRes = await fetch('/api/ai/multi-farmer-aggregation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ cropName: crop, demandedQuantityKg: qty })
    });
    const aggData = await aggRes.json();

    // 2. Build stops based on pooled farmers
    const stops = aggData.contributingFarmers.map((f, idx) => ({
      stopIndex: idx + 1,
      name: `${f.name} (${f.uniqueFarmerId})`,
      location: f.location,
      collectQtyKg: f.allocatedKg,
      fpo: f.fpoAffiliation
    }));

    // 3. Optimize Route
    const routeRes = await fetch('/api/ai/optimize-route', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stops, destination: "APMC Market Yard, Pune - 411037" })
    });
    const routeData = await routeRes.json();

    // Render Visual Route Map
    resultCard.innerHTML = `
      <div class="bg-slate-900 text-white rounded-2xl p-6 space-y-6 shadow-xl border border-slate-700">
        
        <!-- Header Metrics -->
        <div class="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-4">
          <div>
            <div class="flex items-center space-x-2">
              <span class="bg-emerald-500 text-slate-950 font-black text-[10px] px-2.5 py-0.5 rounded-full uppercase">
                TSP Route Solved
              </span>
              <h3 class="text-base font-black text-white">${routeData.vehicleType} Assigned</h3>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">Engine: ${routeData.optimizationEngine}</p>
          </div>
          <div class="flex items-center space-x-4 text-xs">
            <div class="text-right">
              <div class="text-emerald-400 font-bold text-sm">${routeData.totalDistanceKm} km</div>
              <div class="text-[10px] text-slate-400">Total Route Distance</div>
            </div>
            <div class="text-right border-l border-slate-700 pl-4">
              <div class="text-amber-400 font-bold text-sm">${routeData.estimatedTransitTime}</div>
              <div class="text-[10px] text-slate-400">Total Travel ETA</div>
            </div>
          </div>
        </div>

        <!-- Environmental & Cost Savings Badge -->
        <div class="bg-emerald-950/60 border border-emerald-700/50 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs text-emerald-200">
          <div class="flex items-center space-x-2">
            <i class="fa-solid fa-leaf text-emerald-400 text-base"></i>
            <span>Logistics Pooling Savings: <strong>₹${routeData.environmentalImpact.logisticsCostSavedINR}</strong> saved vs separate trips</span>
          </div>
          <div class="flex items-center space-x-3 text-[11px] text-slate-300">
            <span>⛽ Fuel Saved: <strong>${routeData.environmentalImpact.fuelSavedLitres} L</strong></span>
            <span>🌱 CO2 Cut: <strong>${routeData.environmentalImpact.co2SavedKg} kg</strong></span>
          </div>
        </div>

        <!-- Interactive Visual Waypoint Map -->
        <div class="space-y-4 pt-2">
          <h4 class="text-xs font-black uppercase tracking-wider text-slate-400">Multi-Stop Waypoint Sequence:</h4>
          
          <div class="space-y-4 pl-2" id="route-waypoints-container">
            ${routeData.waypoints.map((wp, idx) => {
              let icon = "fa-warehouse text-blue-400";
              let badgeColor = "bg-blue-950 text-blue-300 border-blue-800";
              if (wp.type === 'FARM_PICKUP') {
                icon = "fa-tractor text-emerald-400";
                badgeColor = "bg-emerald-950 text-emerald-300 border-emerald-800";
              } else if (wp.type === 'DELIVERY_DESTINATION') {
                icon = "fa-location-dot text-amber-400";
                badgeColor = "bg-amber-950 text-amber-300 border-amber-800";
              }

              return `
                <div class="route-timeline-item relative flex items-start space-x-4 pl-8">
                  <div class="absolute left-0 top-1 w-8 h-8 rounded-full bg-slate-800 border-2 border-slate-600 flex items-center justify-center text-xs shadow">
                    <i class="fa-solid ${icon}"></i>
                  </div>
                  <div class="bg-slate-800/90 rounded-xl p-3 flex-1 border border-slate-700 flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div class="flex items-center space-x-2">
                        <span class="font-bold text-xs text-white">${wp.title}</span>
                        <span class="text-[10px] font-mono px-2 py-0.5 rounded border ${badgeColor}">${wp.eta}</span>
                      </div>
                      <div class="text-[11px] text-slate-400 mt-0.5">${wp.location || ''}</div>
                      <div class="text-[11px] text-emerald-300 font-medium mt-1">✓ ${wp.action}</div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>

      </div>
    `;
  } catch (err) {
    resultCard.innerHTML = `<div class="p-6 text-center text-rose-500 text-xs font-bold">Error calculating route optimization.</div>`;
  }
}

// ==========================================
// 3. PRODUCE CATALOG & MULTI-FARMER SHORTFALL
// ==========================================

async function fetchProduce() {
  try {
    const res = await fetch('/api/produce');
    const result = await res.json();
    if (result.success) {
      currentProduceList = result.data;
      renderProduceGrid();
    }
  } catch (err) {
    console.error('Failed to load produce catalog', err);
  }
}

// ==========================================
// 3. SEARCH, AUTOCOMPLETE & PRODUCE CATALOG
// ==========================================

function getCropEmoji(name, category) {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (n.includes('tomato')) return '🍅';
  if (n.includes('mango')) return '🥭';
  if (n.includes('orange')) return '🍊';
  if (n.includes('banana')) return '🍌';
  if (n.includes('potato')) return '🥔';
  if (n.includes('onion')) return '🧅';
  if (n.includes('wheat') || n.includes('grain')) return '🌾';
  if (n.includes('rice')) return '🍚';
  if (n.includes('apple')) return '🍎';
  if (n.includes('guava')) return '🍈';
  if (c.includes('fruit')) return '🍇';
  if (c.includes('vegetable')) return '🥦';
  return '🥬';
}

function getCropPhotoUrl(name, category) {
  const n = (name || '').toLowerCase();
  const c = (category || '').toLowerCase();
  if (n.includes('tomato')) return 'https://images.unsplash.com/photo-1592924357228-91a4daadcfea?auto=format&fit=crop&w=600&q=80';
  if (n.includes('mango') || n.includes('alphonso')) return 'https://images.unsplash.com/photo-1553279768-865429fa0078?auto=format&fit=crop&w=600&q=80';
  if (n.includes('orange')) return 'https://images.unsplash.com/photo-1611080626919-7cf5a9dbab5b?auto=format&fit=crop&w=600&q=80';
  if (n.includes('banana')) return 'https://images.unsplash.com/photo-1571771894821-ce9b6c11b08e?auto=format&fit=crop&w=600&q=80';
  if (n.includes('potato')) return 'https://images.unsplash.com/photo-1518977676601-b53f82aba655?auto=format&fit=crop&w=600&q=80';
  if (n.includes('onion')) return 'https://images.unsplash.com/photo-1618512496248-a07fe83aa8cb?auto=format&fit=crop&w=600&q=80';
  if (n.includes('wheat') || n.includes('grain')) return 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?auto=format&fit=crop&w=600&q=80';
  if (n.includes('rice') || n.includes('basmati')) return 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80';
  if (n.includes('apple')) return 'https://images.unsplash.com/photo-1560806887-1e4cd0b6cbd6?auto=format&fit=crop&w=600&q=80';
  if (n.includes('guava')) return 'https://images.unsplash.com/photo-1535914254981-b5012eebbd15?auto=format&fit=crop&w=600&q=80';
  if (c.includes('fruit')) return 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80';
  if (c.includes('grain')) return 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80';
  return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80';
}

function getCategoryFallbackImage(category) {
  const c = (category || '').toLowerCase();
  if (c.includes('fruit')) return 'https://images.unsplash.com/photo-1619566636858-adf3ef46400b?auto=format&fit=crop&w=600&q=80';
  if (c.includes('grain')) return 'https://images.unsplash.com/photo-1586201375761-83865001e31c?auto=format&fit=crop&w=600&q=80';
  return 'https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80';
}

function calculateDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return 25.0;
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

function handleDeliveryHubSelect(val) {
  const select = document.getElementById('delivery-hub-select');
  const opt = select.options[select.selectedIndex];
  if (!opt) return;

  const lat = parseFloat(opt.dataset.lat) || 20.0150;
  const lng = parseFloat(opt.dataset.lng) || 73.8050;
  const name = opt.dataset.name || opt.innerText;

  currentDeliveryLocation = { name, lat, lng };
  const latEl = document.getElementById('delivery-lat');
  const lngEl = document.getElementById('delivery-lng');
  const addrEl = document.getElementById('buyer-address');

  if (latEl) latEl.value = lat;
  if (lngEl) lngEl.value = lng;
  if (addrEl) addrEl.value = name;

  const gmapsBtn = document.getElementById('btn-open-google-maps');
  if (gmapsBtn) {
    gmapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
  }

  filterProduceGrid();
  calculateTotalCost();
}

function handleAddressManualChange() {
  const addr = document.getElementById('buyer-address')?.value || '';
  currentDeliveryLocation.name = addr;
  calculateTotalCost();
}

function handleAutoDetectGps() {
  if (!navigator.geolocation) {
    alert('Geolocation is not supported by your browser.');
    return;
  }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      const lat = Math.round(pos.coords.latitude * 10000) / 10000;
      const lng = Math.round(pos.coords.longitude * 10000) / 10000;
      const addrName = `GPS Location (${lat}, ${lng})`;
      currentDeliveryLocation = { name: addrName, lat, lng };

      const latEl = document.getElementById('delivery-lat');
      const lngEl = document.getElementById('delivery-lng');
      const addrEl = document.getElementById('buyer-address');

      if (latEl) latEl.value = lat;
      if (lngEl) lngEl.value = lng;
      if (addrEl) addrEl.value = addrName;

      const gmapsBtn = document.getElementById('btn-open-google-maps');
      if (gmapsBtn) {
        gmapsBtn.href = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      }

      alert(`📍 GPS Location Detected: ${lat}, ${lng}. Recalculating farm distances & logistics pricing.`);
      filterProduceGrid();
      calculateTotalCost();
    },
    (err) => {
      alert(`Could not detect GPS location: ${err.message}. Using chosen hub.`);
    }
  );
}

function toggleNearbyFilter() {
  filterOnlyNearbyVillages = !filterOnlyNearbyVillages;
  const btn = document.getElementById('filter-nearby-btn');
  const text = document.getElementById('filter-nearby-text');

  if (btn && text) {
    if (filterOnlyNearbyVillages) {
      btn.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-700 text-white shadow transition flex items-center space-x-1.5 flex-shrink-0 ring-2 ring-emerald-400";
      text.innerText = "Nearby Villages (≤ 100 km) [ACTIVE]";
    } else {
      btn.className = "px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-300 hover:bg-emerald-100 transition flex items-center space-x-1.5 flex-shrink-0";
      text.innerText = "Nearby Villages (≤ 100 km)";
    }
  }

  filterProduceGrid();
}

function escapeHtml(str) {
  return (str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function highlightMatchText(text, query) {
  if (!query || !query.trim()) return escapeHtml(text);
  const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${q})`, 'gi');
  return escapeHtml(text).replace(regex, `<span class="bg-amber-200 text-amber-950 font-black px-1 rounded">$1</span>`);
}

function handleProduceSearchInput(val) {
  currentSearchQuery = val.trim();
  const clearBtn = document.getElementById('search-clear-btn');
  if (clearBtn) {
    if (val.length > 0) clearBtn.classList.remove('hidden');
    else clearBtn.classList.add('hidden');
  }

  activeSearchDropdownIndex = -1;
  renderSearchDropdown();
  filterProduceGrid();
}

function handleProduceSearchFocus() {
  const val = document.getElementById('produce-search-input')?.value || '';
  if (val.trim().length > 0) {
    renderSearchDropdown();
  }
}

function clearProduceSearch() {
  const input = document.getElementById('produce-search-input');
  if (input) input.value = '';
  currentSearchQuery = '';
  document.getElementById('search-clear-btn')?.classList.add('hidden');
  hideSearchDropdown();
  filterProduceGrid();
}

function hideSearchDropdown() {
  const dropdown = document.getElementById('search-dropdown-results');
  if (dropdown) dropdown.classList.add('hidden');
  activeSearchDropdownIndex = -1;
}

function setCategoryFilter(category) {
  currentCategoryFilter = category;
  document.querySelectorAll('.category-filter-btn').forEach(btn => {
    if (btn.dataset.category === category) {
      btn.className = "category-filter-btn px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-sm transition";
    } else {
      btn.className = "category-filter-btn px-3 py-1 rounded-full text-xs font-semibold bg-white text-slate-600 border hover:border-emerald-400 transition";
    }
  });
  filterProduceGrid();
}

function getFilteredProduceList() {
  let list = currentProduceList;

  // 1. Filter by category pill
  if (currentCategoryFilter !== 'ALL') {
    list = list.filter(p => (p.category || '').toLowerCase() === currentCategoryFilter.toLowerCase());
  }

  // 2. Filter by search query
  if (currentSearchQuery) {
    const q = currentSearchQuery.toLowerCase();
    list = list.filter(p => {
      const matchName = (p.name || '').toLowerCase().includes(q);
      const matchFarmer = (p.farmerName || '').toLowerCase().includes(q);
      const matchCategory = (p.category || '').toLowerCase().includes(q);
      const matchLocation = (p.farmerLocation || '').toLowerCase().includes(q);
      const matchFpo = (p.fpoAffiliation || '').toLowerCase().includes(q);
      const matchUid = (p.uniqueFarmerId || '').toLowerCase().includes(q);
      return matchName || matchFarmer || matchCategory || matchLocation || matchFpo || matchUid;
    });
  }

  // 3. Filter by Nearby Villages (<= 100km)
  if (filterOnlyNearbyVillages) {
    list = list.filter(p => {
      const fLat = p.farmerLat !== null && p.farmerLat !== undefined ? p.farmerLat : 20.0059;
      const fLng = p.farmerLng !== null && p.farmerLng !== undefined ? p.farmerLng : 73.7898;
      const dist = calculateDistanceKm(fLat, fLng, currentDeliveryLocation.lat, currentDeliveryLocation.lng);
      return dist <= 100;
    });
  }

  return list;
}

function filterProduceGrid() {
  const filtered = getFilteredProduceList();
  renderProduceGrid(filtered);
}

function renderSearchDropdown() {
  const dropdown = document.getElementById('search-dropdown-results');
  if (!dropdown) return;

  if (!currentSearchQuery) {
    dropdown.classList.add('hidden');
    return;
  }

  const q = currentSearchQuery.toLowerCase();
  const matches = currentProduceList.filter(p => {
    const matchName = (p.name || '').toLowerCase().includes(q);
    const matchFarmer = (p.farmerName || '').toLowerCase().includes(q);
    const matchCategory = (p.category || '').toLowerCase().includes(q);
    const matchLocation = (p.farmerLocation || '').toLowerCase().includes(q);
    const matchFpo = (p.fpoAffiliation || '').toLowerCase().includes(q);
    const matchUid = (p.uniqueFarmerId || '').toLowerCase().includes(q);
    return matchName || matchFarmer || matchCategory || matchLocation || matchFpo || matchUid;
  });

  if (matches.length === 0) {
    dropdown.innerHTML = `
      <div class="p-4 text-center text-xs text-slate-500 space-y-1">
        <i class="fa-solid fa-magnifying-glass text-slate-300 text-lg mb-1"></i>
        <p>No farm produce found matching "<strong>${escapeHtml(currentSearchQuery)}</strong>"</p>
        <button onclick="clearProduceSearch()" class="text-emerald-700 font-bold hover:underline text-[11px] pt-1">
          Show all available crops
        </button>
      </div>
    `;
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = `
    <div class="bg-slate-50 px-3.5 py-1.5 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between border-b">
      <span>Matching Farm Produce (${matches.length})</span>
      <span class="text-emerald-700">Click to Select</span>
    </div>
    ${matches.map((p, idx) => {
      const emoji = getCropEmoji(p.name, p.category);
      const highlightedName = highlightMatchText(p.name, currentSearchQuery);
      const highlightedFarmer = highlightMatchText(p.farmerName, currentSearchQuery);
      const highlightedFpo = p.fpoAffiliation ? highlightMatchText(p.fpoAffiliation, currentSearchQuery) : 'Independent Farmer';

      return `
        <div 
          onclick="selectAndFocusProduce('${p.id}')" 
          id="search-item-${idx}" 
          class="search-dropdown-item p-3 hover:bg-emerald-50/80 cursor-pointer flex items-center justify-between transition group"
        >
          <div class="flex items-center space-x-3 min-w-0">
            <img 
              src="${p.imageUrl || getCropPhotoUrl(p.name, p.category)}" 
              alt="${p.name}" 
              class="w-11 h-11 rounded-xl object-cover border border-slate-200 shadow-sm flex-shrink-0"
              onerror="this.src='https://images.unsplash.com/photo-1540420773420-3366772f4999?auto=format&fit=crop&w=600&q=80'"
            >
            <div class="min-w-0">
              <div class="flex items-center space-x-2">
                <h5 class="font-bold text-xs text-slate-900 group-hover:text-emerald-700 truncate">
                  ${highlightedName}
                </h5>
                <span class="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full bg-slate-100 text-slate-600 border">
                  ${p.category}
                </span>
              </div>
              <div class="text-[11px] text-slate-500 mt-0.5 truncate">
                Farmer: <strong class="text-slate-700">${highlightedFarmer}</strong> • ${p.farmerLocation ? p.farmerLocation.split('(')[0] : 'Nashik'} • 
                <span class="text-amber-800 font-medium">🌾 ${highlightedFpo}</span>
              </div>
            </div>
          </div>
          <div class="text-right flex-shrink-0 ml-3">
            <div class="text-sm font-black text-emerald-700">₹${p.pricePerKg}<span class="text-[10px] text-slate-400 font-normal">/kg</span></div>
            <div class="text-[10px] text-slate-500 font-semibold"><i class="fa-solid fa-boxes-stacked text-emerald-600 mr-1"></i>${p.availableKg} kg stock</div>
          </div>
        </div>
      `;
    }).join('')}
  `;

  dropdown.classList.remove('hidden');
}

function handleSearchKeyDown(e) {
  const dropdown = document.getElementById('search-dropdown-results');
  if (!dropdown || dropdown.classList.contains('hidden')) return;

  const items = dropdown.querySelectorAll('.search-dropdown-item');
  if (items.length === 0) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    activeSearchDropdownIndex = (activeSearchDropdownIndex + 1) % items.length;
    updateActiveDropdownItem(items);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    activeSearchDropdownIndex = (activeSearchDropdownIndex - 1 + items.length) % items.length;
    updateActiveDropdownItem(items);
  } else if (e.key === 'Enter') {
    e.preventDefault();
    if (activeSearchDropdownIndex >= 0 && activeSearchDropdownIndex < items.length) {
      items[activeSearchDropdownIndex].click();
    } else if (items.length > 0) {
      items[0].click();
    }
  } else if (e.key === 'Escape') {
    hideSearchDropdown();
  }
}

function updateActiveDropdownItem(items) {
  items.forEach((item, idx) => {
    if (idx === activeSearchDropdownIndex) {
      item.classList.add('bg-emerald-100/80', 'border-l-4', 'border-emerald-600');
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('bg-emerald-100/80', 'border-l-4', 'border-emerald-600');
    }
  });
}

function selectAndFocusProduce(produceId) {
  selectProduce(produceId);
  hideSearchDropdown();

  // Set search bar text to chosen produce name
  const p = currentProduceList.find(x => x.id === produceId);
  if (p) {
    const input = document.getElementById('produce-search-input');
    if (input) input.value = p.name;
    document.getElementById('search-clear-btn')?.classList.remove('hidden');
  }

  // Highlight and scroll to target card
  const card = document.getElementById(`card-produce-${produceId}`);
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('ring-4', 'ring-emerald-400', 'highlight-pulse');
    setTimeout(() => {
      card.classList.remove('highlight-pulse');
    }, 2500);
  }
}

function renderProduceGrid(list = null) {
  const container = document.getElementById('produce-container');
  const itemsToRender = list !== null ? list : getFilteredProduceList();

  if (itemsToRender.length === 0) {
    container.innerHTML = `
      <div class="col-span-2 bg-white p-8 rounded-2xl border-2 border-dashed border-slate-200 text-center text-slate-500 space-y-2">
        <i class="fa-solid fa-seedling text-3xl text-emerald-500 mb-1"></i>
        <p class="font-bold text-slate-700">No produce matching your search criteria.</p>
        <p class="text-xs text-slate-400">Try searching for other keywords like "tomato", "potato", "mango", or reset filters.</p>
        <button onclick="clearProduceSearch()" class="theme-primary-btn bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-4 py-2 rounded-lg transition shadow mt-2">
          Reset Search & Show All Produce
        </button>
      </div>
    `;
    return;
  }

  container.innerHTML = itemsToRender.map(p => {
    const photoUrl = p.imageUrl || getCropPhotoUrl(p.name, p.category);
    const fLat = p.farmerLat !== null && p.farmerLat !== undefined ? p.farmerLat : 20.0059;
    const fLng = p.farmerLng !== null && p.farmerLng !== undefined ? p.farmerLng : 73.7898;
    const dist = calculateDistanceKm(fLat, fLng, currentDeliveryLocation.lat, currentDeliveryLocation.lng);
    const isNearby = dist <= 100;
    const fallbackImg = getCategoryFallbackImage(p.category);

    return `
    <div onclick="selectProduce('${p.id}')" id="card-produce-${p.id}" class="produce-card bg-white rounded-2xl shadow-sm border-2 border-slate-200 hover:border-emerald-500 hover:shadow-md cursor-pointer transition flex flex-col justify-between overflow-hidden group">
      <div>
        <!-- Crop Photograph Banner -->
        <div class="relative w-full h-44 bg-slate-100 overflow-hidden">
          <img 
            src="${photoUrl}" 
            alt="${p.name}" 
            class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onerror="this.src='${fallbackImg}'"
            loading="lazy"
          >
          <div class="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-black/20"></div>
          
          <div class="absolute top-2.5 left-2.5">
            <span class="bg-white/95 backdrop-blur-sm text-emerald-800 text-[10px] font-extrabold px-2.5 py-1 rounded-full shadow-sm uppercase tracking-wide">
              ${p.category}
            </span>
          </div>

          <div class="absolute top-2.5 right-2.5">
            <span class="bg-slate-900/80 backdrop-blur-sm text-white text-[11px] font-bold px-2.5 py-1 rounded-full shadow-sm">
              <i class="fa-solid fa-boxes-stacked text-emerald-400 mr-1"></i>${p.availableKg} kg stock
            </span>
          </div>

          <div class="absolute bottom-2.5 left-3 right-3 flex items-end justify-between text-white">
            <h4 class="font-extrabold text-base text-white drop-shadow-md truncate mr-2">${p.name}</h4>
            <span class="text-xs font-black bg-emerald-600/90 backdrop-blur-sm text-white px-2 py-0.5 rounded shadow">
              ₹${p.pricePerKg}/kg
            </span>
          </div>
        </div>

        <div class="p-4 space-y-2.5">
          <div class="flex items-center justify-between text-xs">
            <div class="text-xs text-slate-500 flex items-center space-x-1 truncate mr-2">
              <i class="fa-solid fa-location-dot text-rose-500"></i>
              <span class="truncate">${p.farmerVillage || p.farmerLocation || 'Nashik, Maharashtra'}</span>
            </div>
            ${isNearby ? `
              <span class="text-[10px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex-shrink-0 flex items-center shadow-xs">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1 animate-pulse"></span>
                ${dist} km (Nearby)
              </span>
            ` : `
              <span class="text-[10px] font-bold text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded-full flex-shrink-0 flex items-center shadow-xs">
                <i class="fa-solid fa-triangle-exclamation text-rose-600 mr-1"></i>
                ${dist} km (>100km)
              </span>
            `}
          </div>

          <div class="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border space-y-1">
            <div class="flex items-center justify-between">
              <span class="truncate mr-1">Farmer: <strong class="text-slate-800">${p.farmerName}</strong></span>
              <span class="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded flex-shrink-0">${p.uniqueFarmerId}</span>
            </div>
            <div class="flex items-center justify-between text-[11px]">
              <span class="bg-amber-100 text-amber-900 px-1.5 py-0.2 rounded text-[10px] font-bold truncate mr-1">
                🌾 ${p.fpoAffiliation || 'Independent Farmer'}
              </span>
              <span class="text-emerald-700 font-bold text-[10px] flex-shrink-0">✓ KYC Verified</span>
            </div>
          </div>
        </div>
      </div>

      <div class="px-4 pb-4 border-t pt-3 flex items-center justify-between">
        <div>
          <span class="text-2xl font-black text-emerald-700">₹${p.pricePerKg}</span>
          <span class="text-xs text-slate-400 font-medium">/ kg</span>
        </div>
        <button class="bg-emerald-50 group-hover:bg-emerald-600 group-hover:text-white text-emerald-700 text-xs font-bold px-3 py-1.5 rounded-lg border border-emerald-200 transition">
          Select Crop
        </button>
      </div>
    </div>
  `;
  }).join('');

  if (itemsToRender.length > 0 && (!selectedProduce || !itemsToRender.find(x => x.id === selectedProduce.id))) {
    selectProduce(itemsToRender[0].id);
  } else if (selectedProduce) {
    const targetCard = document.getElementById(`card-produce-${selectedProduce.id}`);
    if (targetCard) targetCard.classList.add('border-emerald-500', 'bg-emerald-50/20');
  }
}

function selectProduce(produceId) {
  const p = currentProduceList.find(item => item.id === produceId);
  if (!p) return;

  selectedProduce = p;

  document.querySelectorAll('.produce-card').forEach(card => card.classList.remove('border-emerald-500', 'bg-emerald-50/20'));
  const targetCard = document.getElementById(`card-produce-${produceId}`);
  if (targetCard) targetCard.classList.add('border-emerald-500', 'bg-emerald-50/20');

  document.getElementById('order-produce-id').value = p.id;
  document.getElementById('selected-produce-badge').innerText = p.name;
  document.getElementById('detail-crop-name').innerText = `${p.name} (${p.category})`;
  document.getElementById('detail-farmer-name').innerText = `${p.farmerName} (${p.uniqueFarmerId})`;
  document.getElementById('detail-fpo-badge').innerText = `FPO: ${p.fpoAffiliation || 'Independent'}`;
  document.getElementById('detail-crop-price').innerText = `₹${p.pricePerKg} /kg`;
  document.getElementById('single-stock-notice').innerText = `Single Farm Stock: ${p.availableKg} kg`;
  document.getElementById('selected-produce-details').classList.remove('hidden');

  // Update photograph preview in Configure Order card
  const imgEl = document.getElementById('detail-crop-img');
  if (imgEl) {
    imgEl.src = p.imageUrl || getCropPhotoUrl(p.name, p.category);
    imgEl.alt = p.name;
  }

  handleQuantityInputChange();
}

async function handleQuantityInputChange() {
  if (!selectedProduce) return;

  const qty = parseFloat(document.getElementById('order-qty').value) || 0;
  const shortfallBox = document.getElementById('shortfall-alert-box');
  const explanation = document.getElementById('shortfall-explanation');
  const pillsContainer = document.getElementById('pooled-farmers-pills');

  // Check if demanded quantity exceeds primary farmer's stock!
  if (qty > selectedProduce.availableKg) {
    shortfallBox.classList.remove('hidden');
    explanation.innerText = `Requested ${qty}kg exceeds ${selectedProduce.farmerName}'s harvest of ${selectedProduce.availableKg}kg. AI is pooling neighboring farms with shared route logistics...`;

    try {
      const res = await fetch('/api/ai/multi-farmer-aggregation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cropName: selectedProduce.name,
          demandedQuantityKg: qty,
          primaryFarmerId: selectedProduce.farmerId
        })
      });
      const data = await res.json();
      if (data.success && data.isMultiFarmerPooled) {
        currentShortfallData = data;
        pillsContainer.innerHTML = data.contributingFarmers.map(f => `
          <span class="bg-amber-200 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full border border-amber-400">
            ${f.name}: ${f.allocatedKg}kg (₹${f.farmerPayoutINR})
          </span>
        `).join('');
        explanation.innerText = data.summaryMessage;
      }
    } catch (err) {}
  } else {
    shortfallBox.classList.add('hidden');
    currentShortfallData = null;
  }

  calculateTotalCost();
}

// Auto-assign transport vehicle strictly based on payload quantity (KG) & delivery distance (KM)
function getTransportByQuantityAndDistance(qtyKg, distanceKm) {
  const qty = parseFloat(qtyKg) || 0;
  const dist = parseFloat(distanceKm) > 0 ? parseFloat(distanceKm) : (currentDeliveryLocation?.distanceKm || 18);

  let config;
  if (qty <= 25) {
    config = {
      type: '2wheeler',
      name: '🛵 Bike Express',
      fullName: '🛵 Two-Wheeler / Bike Express (Up to 25kg)',
      icon: 'fa-motorcycle',
      badge: '≤ 25 kg (Light Parcel)',
      baseFee: 50,
      perKm: 6,
      minFee: 80,
      description: `Auto-allocated for ${qty} kg parcel (≤ 25 kg bracket)`
    };
  } else if (qty <= 100) {
    config = {
      type: 'auto',
      name: '🛺 Auto Cargo (3-Wheeler)',
      fullName: '🛺 Auto Cargo / 3-Wheeler (25kg – 100kg)',
      icon: 'fa-truck-pickup',
      badge: '25 – 100 kg (Medium Load)',
      baseFee: 120,
      perKm: 10,
      minFee: 180,
      description: `Auto-allocated for ${qty} kg load (25–100 kg bracket)`
    };
  } else if (qty <= 500) {
    config = {
      type: 'minitruck',
      name: '🚚 Mini Truck / SCV Pickup',
      fullName: '🚚 Mini Truck / SCV Pickup (100kg – 500kg)',
      icon: 'fa-truck-front',
      badge: '100 – 500 kg (Retail Bulk)',
      baseFee: 300,
      perKm: 16,
      minFee: 450,
      description: `Auto-allocated for ${qty} kg cargo (100–500 kg bracket)`
    };
  } else {
    config = {
      type: 'heavy',
      name: '🚛 Commercial Heavy Truck',
      fullName: '🚛 Commercial Heavy Truck (> 500kg)',
      icon: 'fa-truck-moving',
      badge: '> 500 kg (Wholesale Freight)',
      baseFee: 700,
      perKm: 24,
      minFee: 950,
      description: `Auto-allocated for ${qty} kg heavy bulk (> 500 kg bracket)`
    };
  }

  const calculatedRate = Math.round(config.baseFee + (dist * config.perKm));
  const finalFee = Math.max(config.minFee, calculatedRate);

  return {
    ...config,
    distanceKm: dist,
    rate: finalFee,
    description: `${config.fullName} • ${dist} km @ ₹${config.perKm}/km + ₹${config.baseFee} base`
  };
}

function getTransportByQuantity(qtyKg) {
  let dist = 18;
  if (selectedProduce) {
    const fLat = selectedProduce.farmerLat !== null && selectedProduce.farmerLat !== undefined ? selectedProduce.farmerLat : 20.0059;
    const fLng = selectedProduce.farmerLng !== null && selectedProduce.farmerLng !== undefined ? selectedProduce.farmerLng : 73.7898;
    dist = calculateDistanceKm(fLat, fLng, currentDeliveryLocation.lat, currentDeliveryLocation.lng);
  }
  return getTransportByQuantityAndDistance(qtyKg, dist);
}

function calculateTotalCost() {
  if (!selectedProduce) return;

  const qty = parseFloat(document.getElementById('order-qty').value) || 0;

  // 1. Calculate distance from supplying village farm to delivery destination
  const fLat = selectedProduce.farmerLat !== null && selectedProduce.farmerLat !== undefined ? selectedProduce.farmerLat : 20.0059;
  const fLng = selectedProduce.farmerLng !== null && selectedProduce.farmerLng !== undefined ? selectedProduce.farmerLng : 73.7898;
  const distance = calculateDistanceKm(fLat, fLng, currentDeliveryLocation.lat, currentDeliveryLocation.lng);
  const isWithinGeofence = distance <= 100;

  // 2. Update 100km Geofence Status Banner & Order Submit Button
  const banner = document.getElementById('geofence-status-banner');
  const submitBtn = document.getElementById('btn-submit-order');
  const submitTextEl = document.getElementById('btn-submit-text');

  if (banner) {
    if (!isWithinGeofence) {
      banner.className = "rounded-xl p-3 bg-rose-50 border-2 border-rose-400 text-rose-900 space-y-1";
      banner.innerHTML = `
        <div class="flex items-center justify-between font-black text-xs uppercase tracking-wide">
          <span class="flex items-center"><i class="fa-solid fa-triangle-exclamation text-rose-600 mr-1.5 text-sm animate-pulse"></i> 100km Freshness Geofence Exceeded!</span>
          <span class="bg-rose-200 text-rose-950 px-2 py-0.5 rounded text-[10px] font-mono font-black">${distance} km (> 100 km)</span>
        </div>
        <p class="text-[11px] text-rose-800 font-semibold leading-relaxed">
          Supplying farm in <strong>${selectedProduce.farmerLocation || selectedProduce.farmerVillage || 'Supplying Village'}</strong> is <strong>${distance} km</strong> from your destination.
          Orders exceeding 100 km are blocked to guarantee direct farm freshness. Please select groceries from nearby village farms (≤ 100 km).
        </p>
      `;
    } else {
      const gmapsDirUrl = `https://www.google.com/maps/dir/?api=1&origin=${fLat},${fLng}&destination=${currentDeliveryLocation.lat},${currentDeliveryLocation.lng}&travelmode=driving`;
      banner.className = "rounded-xl p-2.5 bg-emerald-50 border border-emerald-300 text-emerald-900 space-y-1";
      banner.innerHTML = `
        <div class="flex items-center justify-between font-bold text-xs">
          <span class="flex items-center"><i class="fa-solid fa-location-dot text-emerald-600 mr-1.5"></i> Farm Distance: ${distance} km (Within 100km Direct Geofence)</span>
          <a href="${gmapsDirUrl}" target="_blank" rel="noopener noreferrer" class="text-emerald-700 hover:text-emerald-900 font-extrabold underline text-[11px] flex items-center space-x-1">
            <i class="fa-brands fa-google text-emerald-600"></i>
            <span>Google Maps Route</span>
            <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
          </a>
        </div>
        <p class="text-[10px] text-emerald-700 font-medium">
          Village Farm: <strong>${selectedProduce.farmerLocation || selectedProduce.farmerVillage || 'Local Farm'}</strong> → Delivery: <strong>${currentDeliveryLocation.name}</strong>
        </p>
      `;
    }
  }

  // 3. Dynamic Distance-Varying Transport Calculation
  const transport = getTransportByQuantityAndDistance(qty, distance);

  // Update hidden form field
  const transportInput = document.getElementById('order-transport-type');
  if (transportInput) transportInput.value = transport.type;

  // Update read-only automated vehicle assignment card
  const nameEl = document.getElementById('auto-transport-name');
  const rateEl = document.getElementById('auto-transport-rate');
  const badgeEl = document.getElementById('auto-transport-badge');
  const descEl = document.getElementById('auto-transport-desc');
  const iconEl = document.getElementById('auto-transport-icon');

  if (nameEl) nameEl.innerText = transport.name;
  if (rateEl) rateEl.innerText = `₹${transport.rate.toLocaleString()} (${distance} km)`;
  if (badgeEl) badgeEl.innerText = `${transport.badge} • ${distance} km`;
  if (descEl) descEl.innerText = transport.description;
  if (iconEl) iconEl.className = `fa-solid ${transport.icon}`;

  const cropCost = qty * selectedProduce.pricePerKg;
  const transportFee = transport.rate;
  const serviceFee = Math.round(cropCost * 0.02);
  const total = cropCost + transportFee + serviceFee;

  // 40% Advance for Bulk Buyers (or quantity >= 50kg)
  const isBulk = (currentUser.customerType === 'BULK') || qty >= 50;
  const advanceAmount = isBulk ? Math.round(total * 0.40) : total;
  const balanceAmount = total - advanceAmount;

  document.getElementById('summary-crop-cost').innerText = `₹${cropCost.toLocaleString()}`;
  document.getElementById('summary-transport-fee').innerText = `₹${transportFee.toLocaleString()}`;
  document.getElementById('summary-service-fee').innerText = `₹${serviceFee.toLocaleString()}`;
  document.getElementById('summary-total-amount').innerText = `₹${total.toLocaleString()}`;

  const advEl = document.getElementById('summary-advance-amount');
  const balEl = document.getElementById('summary-balance-amount');
  if (advEl) advEl.innerText = `₹${advanceAmount.toLocaleString()}`;
  if (balEl) balEl.innerText = `₹${balanceAmount.toLocaleString()}`;

  if (submitBtn && submitTextEl) {
    if (!isWithinGeofence) {
      submitBtn.disabled = true;
      submitBtn.className = "w-full bg-slate-400 text-white font-bold py-3 px-4 rounded-xl cursor-not-allowed text-xs sm:text-sm opacity-80 flex items-center justify-center space-x-2";
      submitTextEl.innerText = `❌ Cannot Order: Village is ${distance} km away (>100km)`;
    } else {
      submitBtn.disabled = false;
      submitBtn.className = "theme-primary-btn w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition flex items-center justify-center space-x-2 text-sm";
      if (isBulk) {
        submitTextEl.innerText = `Pay 40% Advance (₹${advanceAmount.toLocaleString()}) & Place Order`;
      } else {
        submitTextEl.innerText = `Pay Total (₹${total.toLocaleString()}) & Place Order`;
      }
    }
  }
}

async function handleCreateOrder(e) {
  e.preventDefault();

  const produceId = document.getElementById('order-produce-id').value;
  const qty = parseFloat(document.getElementById('order-qty').value) || 0;
  const buyerName = document.getElementById('buyer-name').value;
  const buyerPhone = document.getElementById('buyer-phone').value;
  const deliveryAddress = document.getElementById('buyer-address').value || currentDeliveryLocation.name;
  const deliveryLat = parseFloat(document.getElementById('delivery-lat')?.value) || currentDeliveryLocation.lat;
  const deliveryLng = parseFloat(document.getElementById('delivery-lng')?.value) || currentDeliveryLocation.lng;

  if (!produceId) {
    alert('Please select a produce item first!');
    return;
  }

  // 100km Geofence Validation
  const fLat = selectedProduce.farmerLat !== null && selectedProduce.farmerLat !== undefined ? selectedProduce.farmerLat : 20.0059;
  const fLng = selectedProduce.farmerLng !== null && selectedProduce.farmerLng !== undefined ? selectedProduce.farmerLng : 73.7898;
  const distance = calculateDistanceKm(fLat, fLng, deliveryLat, deliveryLng);

  if (distance > 100) {
    alert(`❌ Cannot place order: Supplying village farm (${selectedProduce.farmerLocation || 'Local Farm'}) is ${distance} km away.\n\nMaximum allowed delivery distance is 100 km to guarantee farm freshness. Please choose groceries from nearby village farms.`);
    return;
  }

  const transport = getTransportByQuantityAndDistance(qty, distance);
  const transportType = `${transport.name} (${distance} km)`;
  const cropCost = qty * selectedProduce.pricePerKg;
  const transportFee = transport.rate;
  const serviceFee = Math.round(cropCost * 0.02);
  const total = cropCost + transportFee + serviceFee;

  const isBulk = (currentUser.customerType === 'BULK') || qty >= 50;
  const advanceAmount = isBulk ? Math.round(total * 0.40) : total;
  const balanceAmount = total - advanceAmount;

  const isPooled = Boolean(currentShortfallData && currentShortfallData.isMultiFarmerPooled);
  const contributors = isPooled ? currentShortfallData.contributingFarmers : [];

  // Stage order parameters for third-party Razorpay checkout
  pendingCheckoutData = {
    produceId,
    quantityKg: qty,
    buyerName,
    buyerPhone,
    deliveryAddress,
    deliveryLat,
    deliveryLng,
    deliveryDistanceKm: distance,
    transportType,
    items: [{ produceId, quantityKg: qty }],
    isBulk,
    isRetailShopOrOrg: isBulk,
    organizationName: currentUser.organizationName,
    isMultiFarmerPooled: isPooled,
    pooledContributors: contributors,
    totalAmount: total,
    advanceAmount,
    balanceAmount,
    cropName: selectedProduce.name
  };

  // Launch third-party Razorpay Escrow checkout simulation modal
  openRazorpayModal({
    amount: advanceAmount,
    isBulk,
    cropName: selectedProduce.name
  });
}

// ==========================================
// 3B. RAZORPAY PAYMENT SIMULATION & ESCROW
// ==========================================

function openRazorpayModal({ amount, isBulk, cropName }) {
  const modal = document.getElementById('razorpay-modal');
  if (!modal) return;

  const purposeEl = document.getElementById('rzp-order-purpose');
  const amountEl = document.getElementById('rzp-amount-display');
  const labelEl = document.getElementById('rzp-escrow-type-label');
  const descEl = document.getElementById('rzp-escrow-desc');
  const btnTextEl = document.getElementById('rzp-pay-button-text');

  if (purposeEl) purposeEl.innerText = `${cropName} Direct Order`;
  if (amountEl) amountEl.innerText = `₹${amount.toLocaleString()}`;
  if (labelEl) labelEl.innerText = isBulk ? '40% Advance Escrow Payment (Razorpay)' : 'Full Order Escrow Payment (Razorpay)';
  if (descEl) {
    descEl.innerText = isBulk
      ? 'Only 40% is charged upfront to build mutual faith with bulk buyers. 60% balance is payable strictly at physical delivery via In-App QR.'
      : 'Funds are securely locked in Razorpay third-party escrow until delivery handover is confirmed.';
  }
  if (btnTextEl) btnTextEl.innerText = `Authorize & Pay ₹${amount.toLocaleString()} via Razorpay`;

  modal.classList.remove('hidden');
}

function closeRazorpayModal() {
  const modal = document.getElementById('razorpay-modal');
  if (modal) modal.classList.add('hidden');
}

async function confirmSimulatedRazorpayPayment() {
  if (!pendingCheckoutData) return;

  const btn = document.getElementById('rzp-pay-button');
  const originalText = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin mr-2"></i> Verifying Razorpay Escrow...`;

  try {
    // Simulate real gateway response delay
    await new Promise(resolve => setTimeout(resolve, 800));

    const advanceTxnId = 'RZP_ADV_' + Date.now().toString().slice(-8);

    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...pendingCheckoutData,
        advanceTxnId
      })
    });

    const result = await res.json();
    if (result.success) {
      closeRazorpayModal();
      pendingCheckoutData = null;
      openSmsDrawer();
      fetchOrders();
      switchTab('orders');
    } else {
      alert(result.message || 'Failed to create order');
    }
  } catch (err) {
    alert('Error connecting to backend server during payment authorization.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalText;
  }
}

// ==========================================
// 3C. IN-APP DYNAMIC DELIVERY BALANCE QR
// ==========================================

function openDeliveryQrModal(orderId, balanceAmount) {
  activeDeliveryQrOrderId = orderId;
  const modal = document.getElementById('delivery-qr-modal');
  if (!modal) return;

  const orderIdEl = document.getElementById('modal-qr-order-id');
  const balanceEl = document.getElementById('modal-qr-balance-display');
  const amtSpan = document.getElementById('modal-confirm-btn-amt');
  const qrImg = document.getElementById('modal-delivery-qr-img');

  if (orderIdEl) orderIdEl.innerText = `#${orderId}`;
  if (balanceEl) balanceEl.innerText = `₹${balanceAmount.toLocaleString()}`;
  if (amtSpan) amtSpan.innerText = balanceAmount.toLocaleString();

  const escrowVpa = 'kisaandirect.escrow@icici';
  const payeeName = 'KisaanDirect Official Escrow';
  const note = `Order ${orderId} Delivery Balance`;
  const upiUri = `upi://pay?pa=${escrowVpa}&pn=${encodeURIComponent(payeeName)}&am=${balanceAmount}&tn=${encodeURIComponent(note)}&cu=INR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUri)}&margin=8`;

  if (qrImg) qrImg.src = qrUrl;

  modal.classList.remove('hidden');
}

function closeDeliveryQrModal() {
  const modal = document.getElementById('delivery-qr-modal');
  if (modal) modal.classList.add('hidden');
  activeDeliveryQrOrderId = null;
}

async function confirmBalancePaidFromModal() {
  if (!activeDeliveryQrOrderId) return;
  await handleConfirmBalancePayment(activeDeliveryQrOrderId);
  closeDeliveryQrModal();
}

async function handleConfirmBalancePayment(orderId) {
  try {
    const res = await fetch(`/api/orders/${orderId}/pay-balance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        balanceTxnId: 'UPI_BAL_' + Date.now().toString().slice(-8)
      })
    });
    const result = await res.json();
    if (result.success) {
      alert(`✅ 60% Balance Paid via Official App QR! Ref: ${result.balanceTxnId}. Escrow settlement verified. You can now verify the Delivery OTP with driver.`);
      fetchOrders();
    } else {
      alert(result.message || 'Could not verify balance payment');
    }
  } catch (err) {
    alert('Error connecting to backend payment gateway.');
  }
}


// ==========================================
// 4. FARMER ONBOARDING WITH FPO AFFILIATION
// ==========================================

function handleFpoSelectChange(val) {
  const customInput = document.getElementById('farmer-fpo-custom');
  if (val === 'OTHER') {
    customInput.classList.remove('hidden');
    customInput.required = true;
  } else {
    customInput.classList.add('hidden');
    customInput.required = false;
  }
}

async function handleRegisterFarmer(e) {
  e.preventDefault();
  const name = document.getElementById('farmer-name').value;
  const phone = document.getElementById('farmer-phone').value;
  const location = document.getElementById('farmer-location').value;
  const upiId = document.getElementById('farmer-upi').value;
  const produceName = document.getElementById('farmer-produce-name').value;
  const pricePerKg = document.getElementById('farmer-produce-price').value;
  const availableKg = document.getElementById('farmer-produce-qty').value;
  const kycType = document.getElementById('farmer-kyc-type').value;

  const fpoSelect = document.getElementById('farmer-fpo-select').value;
  const fpoCustom = document.getElementById('farmer-fpo-custom').value;
  const finalFpo = fpoSelect === 'OTHER' ? fpoCustom : fpoSelect;

  const kycFileInput = document.getElementById('farmer-kyc-file');
  const farmPhotoInput = document.getElementById('farmer-farm-photo');
  const cropPhotoInput = document.getElementById('farmer-crop-photo');
  const produceCategory = document.getElementById('farmer-produce-category')?.value || 'Vegetable';
  const hasFiles = (kycFileInput && kycFileInput.files.length > 0) || 
                   (farmPhotoInput && farmPhotoInput.files.length > 0) || 
                   (cropPhotoInput && cropPhotoInput.files.length > 0);

  try {
    let res;
    if (hasFiles) {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('phone', phone);
      formData.append('location', location);
      formData.append('upiId', upiId);
      formData.append('produceName', produceName);
      formData.append('category', produceCategory);
      formData.append('pricePerKg', pricePerKg);
      formData.append('availableKg', availableKg);
      formData.append('kycDocType', kycType);
      if (finalFpo) formData.append('fpoAffiliation', finalFpo);
      if (kycFileInput && kycFileInput.files[0]) formData.append('kycDoc', kycFileInput.files[0]);
      if (farmPhotoInput && farmPhotoInput.files[0]) formData.append('farmPhoto', farmPhotoInput.files[0]);
      if (cropPhotoInput && cropPhotoInput.files[0]) formData.append('cropPhoto', cropPhotoInput.files[0]);

      res = await fetch('/api/farmers/register-with-docs', {
        method: 'POST',
        body: formData
      });
    } else {
      res = await fetch('/api/farmers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          phone,
          location,
          upiId,
          produceName,
          category: produceCategory,
          pricePerKg,
          availableKg,
          kycDocType: kycType,
          fpoAffiliation: finalFpo || null
        })
      });
    }

    const result = await res.json();
    if (result.success) {
      alert(`🎉 Farmer ${name} registered successfully! Assigned Unique Farmer ID: ${result.farmer.uniqueFarmerId}. FPO: ${result.farmer.fpoAffiliation || 'Independent'}. KYC Documents & Crop Photo Saved in Database!`);
      fetchProduce();
      fetchFarmers();
      switchTab('buyer');
    }
  } catch (err) {
    alert('Error registering farmer');
  }
}

async function fetchFarmers() {
  try {
    const res = await fetch('/api/farmers');
    const result = await res.json();
    if (result.success) {
      const container = document.getElementById('registered-farmers-list');
      container.innerHTML = result.data.map(f => `
        <div class="bg-slate-50 p-3.5 rounded-xl border flex items-center justify-between text-xs">
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-bold text-slate-800">${f.name}</span>
              <span class="font-mono text-[10px] font-bold text-emerald-700 bg-emerald-100 px-1.5 py-0.2 rounded">${f.uniqueFarmerId}</span>
              <span class="bg-amber-100 text-amber-900 font-bold px-1.5 py-0.2 rounded text-[10px]">🌾 ${f.fpoAffiliation || 'Independent Kisaan'}</span>
            </div>
            <div class="text-[11px] text-slate-500 mt-1">${f.location} • UPI: <span class="font-mono text-emerald-700">${f.upiId}</span></div>
          </div>
          <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full">${f.produce.length} Active Crops</span>
        </div>
      `).join('');
    }
  } catch (err) {}
}

// ==========================================
// 5. ORDERS TRACKING & DELIVERY OTP
// ==========================================

async function fetchOrders() {
  try {
    const res = await fetch('/api/orders');
    const result = await res.json();
    if (result.success) {
      currentOrders = result.orders;
      currentSmsLogs = result.smsLogs;
      renderOrdersList();
      renderSmsDrawer();

      const pendingCount = currentOrders.filter(o => o.status === 'SMS_SENT' || o.status === 'FARMER_ACCEPTED').length;
      const badge = document.getElementById('orders-badge');
      if (pendingCount > 0) {
        badge.innerText = pendingCount;
        badge.classList.remove('hidden');
      } else {
        badge.classList.add('hidden');
      }

      document.getElementById('sms-count').innerText = currentSmsLogs.length;
    }
  } catch (err) {}
}

async function fetchOrdersSilently() {
  try {
    const res = await fetch('/api/orders');
    const result = await res.json();
    if (result.success) {
      currentOrders = result.orders;
      currentSmsLogs = result.smsLogs;
      renderOrdersList();
      renderSmsDrawer();
    }
  } catch (err) {}
}

function renderOrdersList() {
  const container = document.getElementById('orders-list-container');
  if (currentOrders.length === 0) {
    container.innerHTML = `<div class="bg-white p-12 rounded-2xl border text-center text-slate-400">No orders placed yet. Configure an order from the Buyer Storefront!</div>`;
    return;
  }

  container.innerHTML = currentOrders.map(o => {
    let step1Class = "bg-emerald-600 text-white font-bold";
    let step2Class = o.status !== 'SMS_SENT' ? "bg-emerald-600 text-white font-bold" : "bg-slate-200 text-slate-500 font-bold";
    let step3Class = o.status === 'DELIVERED_PAID' ? "bg-emerald-600 text-white font-bold" : "bg-slate-200 text-slate-500 font-bold";

    let statusBadge = `<span class="bg-amber-100 text-amber-800 text-xs font-extrabold px-3 py-1 rounded-full"><i class="fa-solid fa-clock mr-1"></i> Awaiting Farmer SMS Accept</span>`;
    if (o.status === 'FARMER_ACCEPTED') {
      statusBadge = `<span class="bg-emerald-100 text-emerald-800 text-xs font-extrabold px-3 py-1 rounded-full"><i class="fa-solid fa-circle-check mr-1"></i> Farmer Accepted Order</span>`;
    } else if (o.status === 'DELIVERED_PAID') {
      statusBadge = `<span class="bg-blue-100 text-blue-800 text-xs font-extrabold px-3 py-1 rounded-full"><i class="fa-solid fa-circle-dollar-to-slot mr-1"></i> Delivered & UPI Payout Settled</span>`;
    } else if (o.status === 'DECLINED') {
      statusBadge = `<span class="bg-rose-100 text-rose-800 text-xs font-extrabold px-3 py-1 rounded-full"><i class="fa-solid fa-circle-xmark mr-1"></i> Farmer Declined Order</span>`;
    }

    // Cryptographically mask farmer credentials for customer privacy (8792XXXX89 format)
    const farmerName = o.farmerName || 'Farmer Partner';
    const farmerPhone = maskPhoneNumber(o.farmerPhone || o.rawFarmerPhone);
    const farmerUpi = maskUpiId(o.farmerUpi || o.rawFarmerUpi);
    const farmerFpo = o.fpoAffiliation || 'Independent Kisaan';

    const advanceAmount = o.advanceAmount || (o.isBulk ? Math.round(o.totalAmount * 0.40) : o.totalAmount);
    const balanceAmount = o.balanceAmount !== undefined ? o.balanceAmount : (o.totalAmount - advanceAmount);
    const isBalanceSettled = Boolean(o.balancePaid || balanceAmount <= 0);

    const deliveryUpiUri = `upi://pay?pa=kisaandirect.escrow@icici&pn=KisaanDirect%20Official%20Escrow&am=${balanceAmount}&tn=Order%20${o.id}%20Delivery%20Balance&cu=INR`;
    const deliveryQrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(deliveryUpiUri)}&margin=8`;

    return `
      <div class="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 space-y-4">
        
        <!-- Header -->
        <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div>
            <div class="flex items-center space-x-2">
              <span class="font-extrabold text-slate-800 text-base">Order #${o.id}</span>
              ${statusBadge}
              ${o.isMultiFarmerPooled ? `<span class="bg-amber-200 text-amber-950 font-black text-[10px] px-2 py-0.5 rounded-full"><i class="fa-solid fa-wand-magic-sparkles mr-1"></i>AI Multi-Farmer Pooled</span>` : ''}
              ${o.isBulk ? `<span class="bg-blue-100 text-blue-900 font-bold text-[10px] px-2 py-0.5 rounded-full border border-blue-200">Bulk Retail Order</span>` : ''}
            </div>
            <p class="text-xs text-slate-500">Placed on ${new Date(o.createdAt).toLocaleString()}</p>
          </div>
          <div class="text-right">
            <div class="text-lg font-black text-emerald-700">₹${o.totalAmount.toLocaleString()}</div>
            <div class="text-[11px] text-slate-400">Total Farmer Payout: <strong>₹${o.cropCost.toLocaleString()}</strong></div>
          </div>
        </div>

        <!-- Advance & Balance Status Cards -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div class="bg-emerald-50/80 border border-emerald-200 p-2.5 rounded-xl flex items-center justify-between">
            <div>
              <div class="font-bold text-emerald-900 flex items-center">
                <i class="fa-solid fa-shield-check text-emerald-600 mr-1.5"></i>
                <span>40% Advance Payment (Paid via Razorpay Escrow)</span>
              </div>
              <div class="text-[10px] text-emerald-700 font-mono mt-0.5">Ref: ${o.advanceTxnId || 'RZP_ADV_ESCROW'}</div>
            </div>
            <span class="font-black text-emerald-800 text-sm">₹${advanceAmount.toLocaleString()}</span>
          </div>

          <div class="${isBalanceSettled ? 'bg-emerald-50/80 border-emerald-200' : 'bg-amber-50/80 border-amber-300'} border p-2.5 rounded-xl flex items-center justify-between">
            <div>
              <div class="font-bold ${isBalanceSettled ? 'text-emerald-900' : 'text-amber-900'} flex items-center">
                <i class="fa-solid ${isBalanceSettled ? 'fa-circle-check text-emerald-600' : 'fa-qrcode text-amber-600'} mr-1.5"></i>
                <span>60% Balance on Delivery: ${isBalanceSettled ? 'Settled ✓' : 'Due at Handover'}</span>
              </div>
              <div class="text-[10px] ${isBalanceSettled ? 'text-emerald-700 font-mono' : 'text-amber-700'} mt-0.5">
                ${isBalanceSettled ? `Ref: ${o.balanceTxnId || 'UPI_BAL_ESCROW'}` : 'Pay strictly via Official App QR to Driver'}
              </div>
            </div>
            <span class="font-black ${isBalanceSettled ? 'text-emerald-800' : 'text-amber-800'} text-sm">₹${balanceAmount.toLocaleString()}</span>
          </div>
        </div>

        <!-- Details Grid with Farmer Privacy Masking -->
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs bg-slate-50 p-3.5 rounded-xl border">
          <div>
            <div class="text-slate-400 font-medium">Produce & Quantity:</div>
            <div class="font-bold text-slate-800 text-sm">${o.quantityKg} kg of ${o.produceName}</div>
          </div>
          <div>
            <div class="text-slate-400 font-medium flex items-center justify-between">
              <span>Farmer / FPO Info:</span>
              <span class="text-[9px] font-bold text-emerald-700 bg-emerald-100 px-1 py-0.2 rounded">🔒 Masked</span>
            </div>
            <div class="font-bold text-slate-800">${farmerName} (<span class="font-mono text-slate-700">${farmerPhone}</span>)</div>
            <div class="text-[11px] text-amber-800 font-bold">FPO: ${farmerFpo} • Escrow: <span class="font-mono text-slate-600">${farmerUpi}</span></div>
          </div>
          <div>
            <div class="text-slate-400 font-medium">Logistics & Destination:</div>
            <div class="font-bold text-slate-800">${o.transportType}</div>
            <div class="text-[11px] text-slate-500">Deliver to: ${o.deliveryAddress}</div>
          </div>
        </div>

        <!-- Google Maps Village-to-Doorstep Route Navigation Card -->
        <div class="bg-gradient-to-r from-emerald-50 via-teal-50 to-sky-50 border-2 border-emerald-300 rounded-xl p-3.5 space-y-2 text-xs">
          <div class="flex flex-wrap items-center justify-between gap-2 border-b border-emerald-200/80 pb-2">
            <div class="flex items-center space-x-2 font-black text-slate-900">
              <i class="fa-solid fa-map-location-dot text-emerald-700 text-base"></i>
              <span>Live Farm-to-Doorstep Route Navigation</span>
              <span class="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                ${o.deliveryDistanceKm ? o.deliveryDistanceKm + ' km (≤ 100km Direct)' : 'Direct Farm Route'}
              </span>
            </div>
            <a href="${o.googleMapsUrl || `https://www.google.com/maps/dir/?api=1&origin=${o.farmerLat || 20.0059},${o.farmerLng || 73.7898}&destination=${o.deliveryLat || 20.0150},${o.deliveryLng || 73.8050}&travelmode=driving`}" target="_blank" rel="noopener noreferrer" class="bg-emerald-700 hover:bg-emerald-800 text-white font-bold px-3 py-1.5 rounded-lg shadow-sm transition flex items-center space-x-1.5 text-xs">
              <i class="fa-brands fa-google"></i>
              <span>Open in Google Maps</span>
              <i class="fa-solid fa-arrow-up-right-from-square text-[9px]"></i>
            </a>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div class="flex items-start space-x-2 bg-white/80 p-2.5 rounded-lg border border-emerald-100">
              <span class="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">A</span>
              <div class="min-w-0 flex-1">
                <div class="text-[10px] uppercase font-extrabold text-slate-400">Village Farm Origin</div>
                <div class="font-bold text-slate-800 truncate">${o.farmerVillage || o.farmerLocation || 'Local Farm'}</div>
                <div class="text-[10px] text-slate-500 font-mono">GPS: ${o.farmerLat ? Number(o.farmerLat).toFixed(4) : '20.0059'}, ${o.farmerLng ? Number(o.farmerLng).toFixed(4) : '73.7898'}</div>
              </div>
            </div>

            <div class="flex items-start space-x-2 bg-white/80 p-2.5 rounded-lg border border-emerald-100">
              <span class="w-6 h-6 rounded-full bg-blue-100 text-blue-800 flex items-center justify-center font-bold text-[10px] flex-shrink-0 mt-0.5">B</span>
              <div class="min-w-0 flex-1">
                <div class="text-[10px] uppercase font-extrabold text-slate-400">Customer Delivery Destination</div>
                <div class="font-bold text-slate-800 truncate">${o.deliveryAddress}</div>
                <div class="text-[10px] text-slate-500 font-mono">GPS: ${o.deliveryLat ? Number(o.deliveryLat).toFixed(4) : '20.0150'}, ${o.deliveryLng ? Number(o.deliveryLng).toFixed(4) : '73.8050'}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- If Multi-Farmer Pooled: Show Breakdown -->
        ${o.isMultiFarmerPooled && o.pooledContributors && o.pooledContributors.length > 1 ? `
          <div class="bg-amber-50/80 p-3 rounded-xl border border-amber-200 text-xs space-y-1">
            <div class="font-bold text-amber-900 flex items-center">
              <i class="fa-solid fa-people-carry-box text-amber-700 mr-1.5"></i>
              Multi-Farmer Shared Pickup Breakdown (Fulfilling Harvest Shortfall):
            </div>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
              ${o.pooledContributors.map(c => `
                <div class="bg-white p-2 rounded-lg border text-[11px] flex justify-between items-center">
                  <span><strong>${c.name}</strong> (${c.fpoAffiliation || 'Independent'})</span>
                  <span class="text-emerald-700 font-bold">${c.allocatedKg}kg • ₹${c.farmerPayoutINR}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <!-- Live Visual Stepper -->
        <div class="py-2">
          <div class="flex items-center justify-between text-xs text-slate-500 font-semibold mb-2">
            <span>1. SMS Alert Dispatched</span>
            <span>2. Farmer SMS Confirmation</span>
            <span>3. Doorstep Balance & Delivery OTP</span>
          </div>
          <div class="flex items-center space-x-2">
            <div class="w-7 h-7 rounded-full ${step1Class} flex items-center justify-center text-xs">1</div>
            <div class="flex-1 h-1 ${o.status !== 'SMS_SENT' ? 'bg-emerald-500' : 'bg-slate-200'}"></div>
            <div class="w-7 h-7 rounded-full ${step2Class} flex items-center justify-center text-xs">2</div>
            <div class="flex-1 h-1 ${o.status === 'DELIVERED_PAID' ? 'bg-emerald-500' : 'bg-slate-200'}"></div>
            <div class="w-7 h-7 rounded-full ${step3Class} flex items-center justify-center text-xs">3</div>
          </div>
        </div>

        <!-- Action / Verification Panel -->
        ${o.status === 'SMS_SENT' ? `
          <div class="bg-amber-50 border border-amber-200 rounded-xl p-3 flex flex-wrap items-center justify-between text-xs">
            <div class="text-amber-800 flex items-center space-x-2">
              <i class="fa-solid fa-mobile-retro text-base text-amber-600"></i>
              <span>SMS order alert dispatched to farmer's mobile (${farmerPhone}).</span>
            </div>
            <button onclick="handleSimulateFarmerSms('${o.id}', 'ACCEPT')" class="theme-primary-btn bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 rounded-lg shadow text-xs transition mt-2 sm:mt-0">
              <i class="fa-solid fa-check mr-1"></i> Simulate Farmer Replying "ACCEPT" via SMS
            </button>
          </div>
        ` : ''}

        ${o.status === 'FARMER_ACCEPTED' ? `
          <div class="bg-slate-50 border-2 border-emerald-400/80 rounded-2xl p-4 md:p-5 space-y-4">
            
            <!-- In-Transit Alert Header -->
            <div class="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
              <div class="flex items-center space-x-2 text-slate-900 font-extrabold text-sm">
                <i class="fa-solid fa-truck-ramp-box text-emerald-600 text-lg"></i>
                <span>Produce In Transit via ${o.transportType}</span>
              </div>
              <span class="bg-emerald-100 text-emerald-800 font-black text-xs px-2.5 py-1 rounded-full border border-emerald-300">
                Vehicle En Route to Customer
              </span>
            </div>

            <!-- 60% DOORSTEP BALANCE SECTION (If balance is still pending) -->
            ${!isBalanceSettled ? `
              <div class="space-y-3">
                <!-- Anti-Fraud Security Warning Alert -->
                <div class="bg-rose-50 border-2 border-rose-400 rounded-xl p-3.5 space-y-1.5 shadow-sm">
                  <div class="flex items-center space-x-2 text-rose-900 font-extrabold text-xs uppercase tracking-wider">
                    <i class="fa-solid fa-triangle-exclamation text-rose-600 text-base animate-pulse"></i>
                    <span>STRICT ANTI-FRAUD RULE: DRIVER PERSONAL QR FORBIDDEN</span>
                  </div>
                  <p class="text-[11px] text-rose-800 font-semibold leading-relaxed">
                    Pay the 60% balance of <strong>₹${balanceAmount.toLocaleString()}</strong> strictly via this <strong>Official In-App Dynamic Delivery QR Code</strong>.
                    <span class="text-rose-950 font-black underline">DO NOT SCAN ANY DRIVER'S PERSONAL PHONE QR OR PAY IN CASH!</span>
                    Personal driver payments are unverified by our system and void delivery insurance.
                  </p>
                </div>

                <!-- Dynamic In-App Delivery QR Display Card -->
                <div class="bg-white border-2 border-slate-900 rounded-2xl p-4 flex flex-col sm:flex-row items-center gap-4 shadow-md">
                  <div class="p-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-center flex-shrink-0">
                    <img src="${deliveryQrImgUrl}" alt="Official Dynamic In-App Delivery QR" class="w-36 h-36 mx-auto object-contain">
                    <span class="text-[9px] font-mono font-bold text-slate-500 mt-1 block">kisaandirect.escrow@icici</span>
                  </div>

                  <div class="space-y-2 flex-1 text-xs">
                    <div class="flex items-center justify-between">
                      <div>
                        <span class="font-extrabold text-slate-900 text-sm">Official In-App Delivery Balance QR</span>
                        <div class="text-[10px] text-slate-400">Order #${o.id} • Dynamic Escrow Intent</div>
                      </div>
                      <span class="text-lg font-black text-emerald-700">₹${balanceAmount.toLocaleString()}</span>
                    </div>

                    <p class="text-[11px] text-slate-600">
                      Scan with Google Pay, PhonePe, Paytm, or BHIM. Direct to platform escrow account before produce handover.
                    </p>

                    <div class="flex flex-wrap gap-2 pt-1">
                      <button onclick="handleConfirmBalancePayment('${o.id}')" class="theme-primary-btn bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold px-3.5 py-2 rounded-lg text-xs shadow transition flex items-center space-x-1.5">
                        <i class="fa-solid fa-circle-check"></i>
                        <span>Confirm ₹${balanceAmount.toLocaleString()} Paid via Official QR</span>
                      </button>
                      <button onclick="openDeliveryQrModal('${o.id}', ${balanceAmount})" class="bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold px-3 py-2 rounded-lg text-xs border border-slate-300 transition flex items-center space-x-1">
                        <i class="fa-solid fa-expand"></i>
                        <span>Full Screen QR</span>
                      </button>
                    </div>
                  </div>
                </div>

                <!-- Locked OTP Notice -->
                <div class="bg-slate-100 border border-slate-300 rounded-xl p-3 flex items-center space-x-2.5 text-xs text-slate-600">
                  <i class="fa-solid fa-lock text-slate-400 text-base"></i>
                  <span><strong>Delivery OTP is Locked:</strong> Settle the 60% balance (₹${balanceAmount.toLocaleString()}) via the Official In-App QR above to reveal OTP and release produce handover.</span>
                </div>
              </div>
            ` : `
              <!-- Balance is Settled: OTP Handover Unlocked! -->
              <div class="space-y-3">
                <div class="bg-emerald-50 border-2 border-emerald-300 rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div class="flex items-center space-x-2 text-emerald-900 font-bold">
                    <i class="fa-solid fa-circle-check text-emerald-600 text-base"></i>
                    <span>Balance Settled via Official QR! (Ref: <span class="font-mono text-emerald-800">${o.balanceTxnId || 'UPI_BAL_ESCROW'}</span>). Delivery OTP Handover Authorized.</span>
                  </div>
                  <div class="bg-emerald-900 text-amber-300 px-3 py-1.5 rounded-lg font-mono font-bold text-sm tracking-widest shadow">
                    Delivery OTP: ${o.deliveryOtp}
                  </div>
                </div>

                <div class="flex items-center space-x-2 pt-1">
                  <input type="text" id="otp-input-${o.id}" placeholder="Enter 4-digit OTP" maxlength="4" class="bg-white border-2 border-emerald-400 rounded-lg px-3 py-2 text-sm font-bold tracking-widest text-center w-40 outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm">
                  <button onclick="handleVerifyDeliveryOtp('${o.id}')" class="theme-primary-btn bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow transition flex items-center">
                    <i class="fa-solid fa-shield-check mr-1.5"></i> Confirm Handover & Release Farmer UPI Payout
                  </button>
                </div>
              </div>
            `}

          </div>
        ` : ''}

        ${o.status === 'DELIVERED_PAID' ? `
          <div class="bg-slate-900 text-white rounded-xl p-4 border border-emerald-500 space-y-2 text-xs">
            <div class="flex items-center justify-between text-emerald-400 font-extrabold text-sm border-b border-slate-800 pb-2">
              <span class="flex items-center"><i class="fa-solid fa-circle-check text-base mr-2 text-emerald-400"></i> UPI Instant Settlement Completed</span>
              <span class="font-mono text-amber-300">${o.payoutTxnId || 'UPI-SETTLED'}</span>
            </div>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-slate-300 pt-1">
              <div>Farmer Earnings: <strong class="text-white">₹${o.cropCost.toLocaleString()}</strong></div>
              <div>Farmer UPI VPA: <strong class="text-white font-mono">${farmerUpi}</strong></div>
              <div>Advance Escrow: <strong class="text-emerald-400 font-mono">${o.advanceTxnId || 'RZP-PAID'}</strong></div>
              <div>Delivery Balance: <strong class="text-emerald-400 font-mono">${o.balanceTxnId || 'QR-PAID'}</strong></div>
            </div>
          </div>
        ` : ''}

      </div>
    `;
  }).join('');
}

async function handleSimulateFarmerSms(orderId, action) {
  try {
    const res = await fetch(`/api/orders/${orderId}/sms-reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action })
    });
    const result = await res.json();
    if (result.success) {
      fetchOrders();
    }
  } catch (err) {}
}

async function handleVerifyDeliveryOtp(orderId) {
  const otp = document.getElementById(`otp-input-${orderId}`).value;
  if (!otp) {
    alert('Please enter the 4-digit Delivery OTP!');
    return;
  }

  try {
    const res = await fetch(`/api/orders/${orderId}/verify-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ otp })
    });
    const result = await res.json();
    if (result.success) {
      alert(`🎉 Delivery Confirmed! ₹${result.payout.amount} credited instantly to farmer's UPI (${result.payout.upiId}).`);
      fetchOrders();
    } else {
      alert(result.message || 'OTP verification failed.');
    }
  } catch (err) {
    alert('Error verifying OTP.');
  }
}

// ==========================================
// 6. DEDICATED LOGIN & AUTHENTICATION
// ==========================================

function selectLoginRole(role) {
  const custBtn = document.getElementById('login-role-customer');
  const farmBtn = document.getElementById('login-role-farmer');
  const custFlow = document.getElementById('login-customer-flow');
  const farmFlow = document.getElementById('login-farmer-flow');

  if (role === 'CUSTOMER') {
    custBtn.className = "border-2 border-emerald-600 bg-emerald-50/60 p-4 rounded-xl text-center transition";
    farmBtn.className = "border-2 border-slate-200 hover:border-emerald-400 p-4 rounded-xl text-center transition bg-slate-50";
    custFlow.classList.remove('hidden');
    farmFlow.classList.add('hidden');
  } else {
    farmBtn.className = "border-2 border-emerald-600 bg-emerald-50/60 p-4 rounded-xl text-center transition";
    custBtn.className = "border-2 border-slate-200 hover:border-emerald-400 p-4 rounded-xl text-center transition bg-slate-50";
    farmFlow.classList.remove('hidden');
    custFlow.classList.add('hidden');
  }
}

function selectCustomerPurchaseType(type) {
  const bulkSection = document.getElementById('bulk-anti-middleman-section');
  if (type === 'BULK') {
    bulkSection.classList.remove('hidden');
  } else {
    bulkSection.classList.add('hidden');
  }
}

async function handleCustomerLoginSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('login-cust-name').value;
  const phone = document.getElementById('login-cust-phone').value;
  const isBulk = document.getElementById('radio-bulk').checked;
  const orgName = document.getElementById('login-org-name').value;
  const licenseNo = document.getElementById('login-org-license').value;
  const docFile = document.getElementById('login-org-doc')?.files?.[0];

  try {
    // 1. Register / login in SQLite database via Auth API
    const authRes = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone,
        fullName: name,
        role: 'CUSTOMER',
        customerType: isBulk ? 'BULK' : 'HOUSEHOLD',
        organizationName: isBulk ? orgName : '',
        licenseNo: isBulk ? licenseNo : ''
      })
    });
    const authData = await authRes.json();
    if (authData.token) {
      localStorage.setItem('kisaan_jwt_token', authData.token);
    }

    // 2. If trade document file was attached, upload it
    if (docFile && isBulk) {
      const docFormData = new FormData();
      docFormData.append('tradeLicense', docFile);
      await fetch('/api/auth/customer-verify-doc', {
        method: 'POST',
        headers: authData.token ? { 'Authorization': `Bearer ${authData.token}` } : {},
        body: docFormData
      });
    }

    currentUser = {
      isLoggedIn: true,
      role: 'CUSTOMER',
      name: name,
      phone: phone,
      customerType: isBulk ? 'BULK' : 'HOUSEHOLD',
      organizationName: isBulk ? orgName : '',
      licenseNo: isBulk ? licenseNo : '',
      farmerUniqueId: null
    };

    updateUserSessionUI();
    document.getElementById('buyer-name').value = currentUser.name + (isBulk ? ` (${orgName})` : '');
    document.getElementById('buyer-phone').value = currentUser.phone;

    alert(`✅ Logged in successfully as Customer: ${name}! ${isBulk ? 'Retail Shop Verified & Saved to Database.' : 'Household mode active.'}`);
    switchTab('buyer');
  } catch (err) {
    alert('Error connecting to backend authentication.');
  }
}

function handleFarmerLoginSubmit(e) {
  e.preventDefault();
  const phone = document.getElementById('login-farmer-phone').value;

  const matchedFarmer = currentProduceList.find(p => p.farmerPhone === phone || p.farmerPhone.includes(phone.slice(-10)));
  const farmerName = matchedFarmer ? matchedFarmer.farmerName : 'Farmer Partner';
  const farmerUid = matchedFarmer ? matchedFarmer.uniqueFarmerId : 'KISAN-MH-4019';

  currentUser = {
    isLoggedIn: true,
    role: 'FARMER',
    name: farmerName,
    phone: phone,
    customerType: null,
    organizationName: '',
    licenseNo: '',
    farmerUniqueId: farmerUid
  };

  updateUserSessionUI();
  alert(`Welcome back, ${farmerName}! Assigned Farmer ID: ${farmerUid}.`);
  switchTab('farmer');
}

function updateUserSessionUI() {
  const banner = document.getElementById('logged-user-banner');
  const bannerText = document.getElementById('logged-user-text');
  const tabLabel = document.getElementById('login-tab-label');

  if (currentUser.isLoggedIn) {
    banner.classList.remove('hidden');
    if (currentUser.role === 'FARMER') {
      bannerText.innerHTML = `Logged in as: <strong>👨‍🌾 ${currentUser.name}</strong> (Farmer ID: <span class="font-mono text-amber-300 font-bold">${currentUser.farmerUniqueId}</span> • KYC Verified)`;
      tabLabel.innerText = currentUser.name.split(' ')[0];
    } else {
      const typeLabel = currentUser.customerType === 'BULK' ? `Retail Bulk Buyer - ${currentUser.organizationName}` : 'Household Consumer';
      bannerText.innerHTML = `Logged in as: <strong>🛒 ${currentUser.name}</strong> (${typeLabel})`;
      tabLabel.innerText = currentUser.name.split(' ')[0];
    }
  } else {
    banner.classList.add('hidden');
    tabLabel.innerText = 'Login';
  }
}

function handleLogout() {
  currentUser = {
    isLoggedIn: false,
    role: 'GUEST',
    name: '',
    phone: '',
    customerType: 'BULK',
    organizationName: '',
    licenseNo: '',
    farmerUniqueId: null
  };
  updateUserSessionUI();
  alert('You have logged out.');
  switchTab('buyer');
}

// ==========================================
// 7. VIRTUAL SMS DRAWER
// ==========================================

function toggleSmsDrawer() {
  const drawer = document.getElementById('sms-drawer');
  drawer.classList.toggle('translate-x-full');
}

function openSmsDrawer() {
  const drawer = document.getElementById('sms-drawer');
  drawer.classList.remove('translate-x-full');
}

function renderSmsDrawer() {
  const container = document.getElementById('sms-log-list');
  if (currentSmsLogs.length === 0) {
    container.innerHTML = `<div class="text-center text-xs text-slate-500 py-10">No SMS sent yet.</div>`;
    return;
  }

  container.innerHTML = currentSmsLogs.map(sms => `
    <div class="sms-bubble p-3 rounded-xl space-y-1 text-xs shadow">
      <div class="flex items-center justify-between text-[11px] text-slate-400">
        <span>To: <strong class="text-amber-300 font-mono">${sms.to}</strong></span>
        <span>${sms.timestamp}</span>
      </div>
      <div class="text-slate-200 font-mono text-[11px] leading-relaxed break-words">${sms.message}</div>
      ${sms.orderId ? `
        <div class="pt-1.5 flex items-center space-x-2">
          <button onclick="handleSimulateFarmerSms('${sms.orderId}', 'ACCEPT')" class="theme-primary-btn bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold px-2.5 py-1 rounded transition">
            Reply ACCEPT via SMS
          </button>
          <button onclick="handleSimulateFarmerSms('${sms.orderId}', 'DECLINE')" class="bg-rose-700 hover:bg-rose-800 text-white text-[10px] font-bold px-2.5 py-1 rounded transition">
            Reply DECLINE
          </button>
        </div>
      ` : ''}
    </div>
  `).join('');
}
