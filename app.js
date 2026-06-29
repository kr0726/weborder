/* ==========================================
   Order Queue Application - App Logic
   ========================================== */

// LocalStorage Keys
const KEYS = {
  ORDERS: 'oq_orders',
  COUNTER: 'oq_counter',
  CALL_SIGNAL: 'oq_call_signal'
};

// Global App State
let cart = {}; // Key: "chicken_[flavors_joined]", Value: { name: "から揚げ", flavor: "...", qty: N }
let orderQty = 1; // Temporary state for ordering panel quantity
let audioCtx = null; // Lazy loaded Web Audio context for chime
let cartTotalPrice = 0; // Current cart total amount for change calculation

// ==========================================
// Storage Helper Functions
// ==========================================
function getOrders() {
  const data = localStorage.getItem(KEYS.ORDERS);
  return data ? JSON.parse(data) : [];
}

function saveOrders(orders) {
  localStorage.setItem(KEYS.ORDERS, JSON.stringify(orders));
  window.dispatchEvent(new Event('ordersUpdated'));
}

function getNextTicketNumber() {
  let counter = localStorage.getItem(KEYS.COUNTER);
  if (!counter) {
    counter = 100; // Start at 100
  }
  counter = parseInt(counter) + 1;
  localStorage.setItem(KEYS.COUNTER, counter.toString());
  return counter;
}

// ==========================================
// Page Routing & Initialization
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const role = params.get('role');

  // Hide all views first
  document.querySelectorAll('.role-view').forEach(el => el.style.display = 'none');

  if (!role) {
    document.getElementById('view-portal').style.display = 'block';
  } else if (role === 'staff') {
    document.getElementById('view-staff').style.display = 'block';
    initStaffView();
  } else if (role === 'display') {
    document.getElementById('view-display').style.display = 'block';
    initDisplayView();
  } else if (role === 'sales') {
    document.getElementById('view-sales').style.display = 'block';
    initSalesView();
  } else {
    document.getElementById('view-portal').style.display = 'block';
  }
});

// ==========================================
// Staff Combined View Logic (統合スタッフ画面)
// ==========================================
function initStaffView() {
  console.log('Staff View Initialized');
  
  const orderSubmitBtn = document.getElementById('order-submit-btn');
  if (orderSubmitBtn) {
    orderSubmitBtn.addEventListener('click', submitOrder);
  }

  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.ORDERS) {
      renderKitchenBoard();
    }
  });

  window.addEventListener('ordersUpdated', renderKitchenBoard);

  renderKitchenBoard();
  updateCartUI();
}

// Tab Switching
window.switchStaffTab = (tabName) => {
  const btnOrder = document.getElementById('tab-btn-order');
  const btnKitchen = document.getElementById('tab-btn-kitchen');
  const panelOrder = document.getElementById('panel-order');
  const panelKitchen = document.getElementById('panel-kitchen');

  if (tabName === 'order') {
    btnOrder.classList.add('active');
    btnKitchen.classList.remove('active');
    panelOrder.classList.add('active');
    panelKitchen.classList.remove('active');
  } else if (tabName === 'kitchen') {
    btnOrder.classList.remove('active');
    btnKitchen.classList.add('active');
    panelOrder.classList.remove('active');
    panelKitchen.classList.add('active');
    renderKitchenBoard();
  }
};

// Toggle logic for checkboxes (handling "なし" / flavor options interaction)
window.onFlavorChange = (clickedCheckbox) => {
  const checkboxes = document.getElementsByName('flavor-option');
  const noneCheckbox = Array.from(checkboxes).find(cb => cb.value === 'なし');

  if (clickedCheckbox.value === 'なし') {
    if (clickedCheckbox.checked) {
      // If "なし" is checked, uncheck everything else
      checkboxes.forEach(cb => {
        if (cb.value !== 'なし') cb.checked = false;
      });
    }
  } else {
    if (clickedCheckbox.checked) {
      // If any other flavor is checked, uncheck "なし"
      if (noneCheckbox) noneCheckbox.checked = false;
    }
  }

  // If no flavor checkboxes are checked at all, default back to "なし"
  const anyChecked = Array.from(checkboxes).some(cb => cb.checked);
  if (!anyChecked && noneCheckbox) {
    noneCheckbox.checked = true;
  }
};

// Quantity Counter adjustment on the Ordering Card
window.changeOrderQty = (delta) => {
  orderQty += delta;
  if (orderQty < 1) orderQty = 1;
  document.getElementById('order-qty-val').innerText = orderQty;
};

// Add product (chicken + selected flavors) to cart
window.addChickenToCart = () => {
  const checkboxes = document.getElementsByName('flavor-option');
  const selectedFlavors = Array.from(checkboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.value);

  // Fallback to "なし" if somehow nothing is checked
  if (selectedFlavors.length === 0) {
    selectedFlavors.push('なし');
  }

  const flavorStr = selectedFlavors.join(', ');
  const key = `chicken_${selectedFlavors.join('_')}`;
  const pricePerPack = 500;

  if (cart[key]) {
    cart[key].qty += orderQty;
  } else {
    cart[key] = {
      name: 'から揚げ',
      flavor: flavorStr,
      price: pricePerPack,
      qty: orderQty
    };
  }

  // Reset temporary counter back to 1
  orderQty = 1;
  document.getElementById('order-qty-val').innerText = '1';

  // Reset checkboxes (check "なし", uncheck others)
  checkboxes.forEach(cb => {
    cb.checked = (cb.value === 'なし');
  });

  updateCartUI();
};

// Edit cart quantity
window.changeCartQty = (key, delta) => {
  if (!cart[key]) return;
  cart[key].qty += delta;
  if (cart[key].qty <= 0) {
    delete cart[key];
  }
  updateCartUI();
};

// Re-render Cart UI
function updateCartUI() {
  const cartContainer = document.getElementById('cart-container');
  const cartCountBadge = document.getElementById('cart-count');
  const cartTotalPriceText = document.getElementById('cart-total-price');
  const orderSubmitBtn = document.getElementById('order-submit-btn');

  const cartKeys = Object.keys(cart);
  if (cartKeys.length === 0) {
    cartContainer.innerHTML = `<div style="text-align: center; color: var(--text-muted); margin-top: 50px;">カートは空です</div>`;
    cartCountBadge.innerText = '0 点';
    if (cartTotalPriceText) cartTotalPriceText.innerText = '¥0';
    cartTotalPrice = 0;
    calculateChange();
    orderSubmitBtn.disabled = true;
    return;
  }

  let totalCount = 0;
  let totalPrice = 0;

  cartContainer.innerHTML = cartKeys.map(key => {
    const item = cart[key];
    totalCount += item.qty;
    totalPrice += item.price * item.qty;

    return `
      <div class="cart-item">
        <div class="cart-item-info">
          <div class="cart-item-name">${item.name} (${item.flavor})</div>
          <div class="cart-item-price">¥${item.price.toLocaleString()} x ${item.qty}</div>
        </div>
        <div class="cart-item-qty">
          <button class="qty-btn" onclick="changeCartQty('${key}', -1)">−</button>
          <span style="font-weight: 600; min-width: 15px; text-align: center;">${item.qty}</span>
          <button class="qty-btn" onclick="changeCartQty('${key}', 1)">+</button>
        </div>
      </div>
    `;
  }).join('');

  cartCountBadge.innerText = `${totalCount} 点`;
  if (cartTotalPriceText) cartTotalPriceText.innerText = `¥${totalPrice.toLocaleString()}`;
  cartTotalPrice = totalPrice;
  calculateChange();
  orderSubmitBtn.disabled = false;
}

// Cash register change calculation
window.calculateChange = () => {
  const tenderedInput = document.getElementById('cash-tendered');
  const changeText = document.getElementById('cash-change');
  if (!tenderedInput || !changeText) return;

  const tenderedVal = parseInt(tenderedInput.value) || 0;
  
  if (tenderedVal === 0) {
    changeText.innerText = '¥0';
    changeText.style.color = 'var(--accent-blue)';
    return;
  }

  const change = tenderedVal - cartTotalPrice;
  if (change < 0) {
    changeText.innerText = `不足 ¥${Math.abs(change).toLocaleString()}`;
    changeText.style.color = 'var(--accent-rose)';
  } else {
    changeText.innerText = `¥${change.toLocaleString()}`;
    changeText.style.color = 'var(--accent-green)';
  }
};

// Checkout order
function submitOrder() {
  const cartKeys = Object.keys(cart);
  if (cartKeys.length === 0) return;

  const ticketNum = getNextTicketNumber();
  const formattedNum = `#${ticketNum.toString().padStart(3, '0')}`;
  
  const itemsList = cartKeys.map(key => ({
    name: cart[key].name,
    flavor: cart[key].flavor,
    qty: cart[key].qty
  }));

  const newOrder = {
    id: ticketNum,
    formattedId: formattedNum,
    items: itemsList,
    status: 'pending',
    time: Date.now()
  };

  const orders = getOrders();
  orders.push(newOrder);
  saveOrders(orders);

  // Send request to server to log the order in CSV
  fetch('/api/log-order', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(newOrder)
  }).then(res => {
    console.log('Order logged in CSV spreadsheet:', res.status);
  }).catch(err => {
    console.error('Error logging order to CSV:', err);
  });

  // Load ticket details in modal
  document.getElementById('modal-ticket-num').innerText = formattedNum;
  const timeStr = new Date(newOrder.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  document.getElementById('modal-ticket-time').innerText = `${new Date().toLocaleDateString('ja-JP')} ${timeStr}`;

  document.getElementById('modal-ticket-items').innerHTML = newOrder.items.map(item => `
    <div class="row">
      <span>${item.name} (${item.flavor}) x ${item.qty}</span>
    </div>
  `).join('');

  // Reset Cash Register fields
  const tenderedInput = document.getElementById('cash-tendered');
  if (tenderedInput) tenderedInput.value = '';
  const changeText = document.getElementById('cash-change');
  if (changeText) {
    changeText.innerText = '¥0';
    changeText.style.color = 'var(--accent-blue)';
  }

  document.getElementById('ticket-modal').classList.add('active');

  cart = {};
  updateCartUI();
}

window.closeTicketModal = () => {
  document.getElementById('ticket-modal').classList.remove('active');
};

// ==========================================
// Kitchen Management View Logic (注文状況・管理)
// ==========================================
function renderKitchenBoard() {
  const pendingList = document.getElementById('column-pending-list');
  const readyList = document.getElementById('column-ready-list');
  
  if (!pendingList || !readyList) return;

  const orders = getOrders();

  const pendingOrders = orders.filter(o => o.status === 'pending');
  const readyOrders = orders.filter(o => o.status === 'ready');

  document.getElementById('count-pending').innerText = pendingOrders.length;
  document.getElementById('count-ready').innerText = readyOrders.length;

  pendingList.innerHTML = '';
  readyList.innerHTML = '';

  orders.forEach(order => {
    if (order.status === 'completed') return;

    const timeStr = new Date(order.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

    const itemsHtml = order.items.map(item => `
      <li>
        <span>${item.name} (${item.flavor})</span>
        <span style="font-weight: 600;">x ${item.qty}</span>
      </li>
    `).join('');

    let actionButtons = '';
    if (order.status === 'pending') {
      actionButtons = `<button class="btn btn-success btn-sm" onclick="callOrder(${order.id})">完成・呼び出し</button>`;
    } else if (order.status === 'ready') {
      actionButtons = `
        <button class="btn btn-primary btn-sm" onclick="callOrder(${order.id}, true)">再呼出</button>
        <button class="btn btn-success btn-sm" onclick="updateOrderStatus(${order.id}, 'completed')">お渡し完了</button>
      `;
    }

    const cardHtml = `
      <div class="order-card glass-card">
        <div class="order-card-header">
          <span class="order-ticket-num">${order.formattedId}</span>
          <span class="order-time">${timeStr}</span>
        </div>
        <ul class="order-card-items">
          ${itemsHtml}
        </ul>
        <div class="order-card-actions">
          ${actionButtons}
        </div>
      </div>
    `;

    if (order.status === 'pending') pendingList.innerHTML += cardHtml;
    if (order.status === 'ready') readyList.innerHTML += cardHtml;
  });

  if (pendingList.children.length === 0) {
    pendingList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">未着手の注文はありません</div>`;
  }
  if (readyList.children.length === 0) {
    readyList.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 30px;">呼び出し中のお客様はいません</div>`;
  }
}

window.updateOrderStatus = (id, newStatus) => {
  const orders = getOrders();
  const orderIndex = orders.findIndex(o => o.id === id);
  if (orderIndex !== -1) {
    orders[orderIndex].status = newStatus;
    saveOrders(orders);
  }
};

window.callOrder = (id, isRecall = false) => {
  const orders = getOrders();
  const order = orders.find(o => o.id === id);
  if (order) {
    if (!isRecall) {
      order.status = 'ready';
      saveOrders(orders);
    }
    const signal = {
      id: order.id,
      num: order.id.toString().padStart(3, '0'),
      time: Date.now(),
      isRecall: isRecall
    };
    localStorage.setItem(KEYS.CALL_SIGNAL, JSON.stringify(signal));
  }
};

// ==========================================
// Display Board View Logic (呼び出し状況表示板)
// ==========================================
function initDisplayView() {
  console.log('Display View Initialized');
  const readyContainer = document.getElementById('display-ready-container');

  let activeCallingId = null;

  function renderDisplayBoard() {
    const orders = getOrders();
    const readyOrders = orders.filter(o => o.status === 'ready');

    if (readyOrders.length === 0) {
      readyContainer.innerHTML = `
        <div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); margin-top: 100px; font-size: 1.5rem;">
          お呼び出し中の番号はありません
        </div>`;
    } else {
      readyContainer.innerHTML = readyOrders.map(order => {
        const isNewlyCalled = order.id === activeCallingId;
        const formattedNum = order.id.toString().padStart(3, '0');
        return `
          <div class="ready-ticket-card-large glass-card ${isNewlyCalled ? 'newly-called' : ''}">
            <span class="num-label">整理券番号</span>
            <span class="num">${formattedNum}</span>
          </div>
        `;
      }).join('');
    }
  }

  function handleCallSignal(signal) {
    console.log('Received Call Signal:', signal);
    activeCallingId = signal.id;
    renderDisplayBoard();

    // Fade active glow highlight after 10 seconds
    setTimeout(() => {
      if (activeCallingId === signal.id) {
        activeCallingId = null;
        renderDisplayBoard();
      }
    }, 10000);
  }

  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.CALL_SIGNAL && e.newValue) {
      const signal = JSON.parse(e.newValue);
      handleCallSignal(signal);
    }
    if (e.key === KEYS.ORDERS) {
      renderDisplayBoard();
    }
  });

  renderDisplayBoard();
}

// ==========================================
// Sales Dashboard View Logic (売上管理画面)
// ==========================================
const PRICE_PER_PACK = 500;

function initSalesView() {
  console.log('Sales View Initialized');

  // Initial render
  renderSalesDashboard();

  // Real-time update when orders change in another tab
  window.addEventListener('storage', (e) => {
    if (e.key === KEYS.ORDERS) {
      renderSalesDashboard();
    }
  });

  // Auto-refresh every 30 seconds as a safety net
  setInterval(renderSalesDashboard, 30000);
}

// Exposed globally so the "今すぐ更新" button can call it
window.renderSalesDashboard = function renderSalesDashboard() {
  const orders = getOrders();

  // ── KPI Totals ────────────────────────────────────────
  const totalOrders    = orders.length;
  const completedCount = orders.filter(o => o.status === 'completed').length;

  let totalPacks   = 0;
  let totalRevenue = 0;

  // Flavor aggregation: { "だし醤油": qty, ... }
  const flavorMap = {};

  orders.forEach(order => {
    (order.items || []).forEach(item => {
      const qty = item.qty || 0;
      totalPacks   += qty;
      totalRevenue += qty * PRICE_PER_PACK;

      // Split combined flavors like "だし醤油, 七味" into individual keys
      const flavors = item.flavor ? item.flavor.split(',').map(f => f.trim()) : ['なし'];
      flavors.forEach(f => {
        flavorMap[f] = (flavorMap[f] || 0) + qty;
      });
    });
  });

  // Update KPI cards
  document.getElementById('kpi-orders').innerText    = totalOrders;
  document.getElementById('kpi-packs').innerText     = totalPacks;
  document.getElementById('kpi-revenue').innerText   = `¥${totalRevenue.toLocaleString()}`;
  document.getElementById('kpi-completed').innerText = completedCount;

  // ── Flavor Table ──────────────────────────────────────
  const flavorBody  = document.getElementById('flavor-table-body');
  const flavorEntries = Object.entries(flavorMap).sort((a, b) => b[1] - a[1]);

  if (flavorEntries.length === 0) {
    flavorBody.innerHTML = `<tr><td colspan="4" style="color:var(--text-muted);padding:20px;text-align:center;">注文データがありません</td></tr>`;
  } else {
    const maxQty = flavorEntries[0][1];
    flavorBody.innerHTML = flavorEntries.map(([flavor, qty]) => {
      const revenue = qty * PRICE_PER_PACK;
      const pct     = totalPacks > 0 ? Math.round(qty / totalPacks * 100) : 0;
      const barW    = maxQty  > 0 ? Math.round(qty / maxQty  * 100) : 0;
      return `
        <tr>
          <td style="font-weight:600;">${flavor}</td>
          <td style="color:var(--accent-blue);font-weight:700;">${qty}</td>
          <td>
            <div class="flavor-bar-wrap">
              <div class="flavor-bar-bg">
                <div class="flavor-bar-fill" style="width:${barW}%"></div>
              </div>
              <span class="flavor-bar-pct">${pct}%</span>
            </div>
          </td>
          <td style="color:var(--accent-green);font-weight:600;">¥${revenue.toLocaleString()}</td>
        </tr>`;
    }).join('');
  }

  // ── Hourly Bar Chart (Canvas) ──────────────────────────
  const canvas    = document.getElementById('hourly-chart');
  const emptyMsg  = document.getElementById('chart-empty-msg');

  // Build hourly bucket (0–23)
  const hourBuckets = new Array(24).fill(0);
  orders.forEach(order => {
    if (order.time) {
      const h = new Date(order.time).getHours();
      hourBuckets[h]++;
    }
  });

  const hasData = hourBuckets.some(v => v > 0);

  if (!hasData) {
    canvas.style.display  = 'none';
    emptyMsg.style.display = 'block';
  } else {
    canvas.style.display  = 'block';
    emptyMsg.style.display = 'none';

    // Dynamically set pixel width to match CSS display width
    const displayW = canvas.parentElement.clientWidth || 600;
    canvas.width   = displayW * (window.devicePixelRatio || 1);
    canvas.height  = 220  * (window.devicePixelRatio || 1);
    canvas.style.width  = displayW + 'px';
    canvas.style.height = '220px';

    const ctx   = canvas.getContext('2d');
    const dpr   = window.devicePixelRatio || 1;
    ctx.scale(dpr, dpr);

    const W   = displayW;
    const H   = 220;
    const padL = 36, padR = 12, padT = 16, padB = 34;
    const chartW = W - padL - padR;
    const chartH = H - padT - padB;

    ctx.clearRect(0, 0, W, H);

    // Find only hours that have at least 1 order OR span the range we want (current operating hours)
    const nonZeroHours = hourBuckets.reduce((acc, v, i) => { if (v > 0) acc.push(i); return acc; }, []);
    const minH = nonZeroHours.length ? Math.max(0, nonZeroHours[0] - 1)  : 8;
    const maxH = nonZeroHours.length ? Math.min(23, nonZeroHours[nonZeroHours.length - 1] + 1) : 20;
    const displayHours = [];
    for (let i = minH; i <= maxH; i++) displayHours.push(i);

    const maxVal    = Math.max(...hourBuckets, 1);
    const barCount  = displayHours.length;
    const barGap    = 4;
    const barW      = barCount > 0 ? (chartW - barGap * (barCount - 1)) / barCount : 30;

    // Grid lines
    const gridSteps = 4;
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth   = 1;
    for (let i = 0; i <= gridSteps; i++) {
      const y = padT + chartH - (chartH / gridSteps * i);
      ctx.beginPath();
      ctx.moveTo(padL, y);
      ctx.lineTo(padL + chartW, y);
      ctx.stroke();
      // Y-axis label
      const label = Math.round(maxVal / gridSteps * i);
      ctx.fillStyle  = 'rgba(148,163,184,0.7)';
      ctx.font       = `${11 * dpr / dpr}px Inter, sans-serif`;
      ctx.textAlign  = 'right';
      ctx.fillText(label, padL - 4, y + 4);
    }

    // Bars
    displayHours.forEach((hour, idx) => {
      const val  = hourBuckets[hour];
      const barH = val > 0 ? Math.max(4, (val / maxVal) * chartH) : 0;
      const x    = padL + idx * (barW + barGap);
      const y    = padT + chartH - barH;

      // Gradient fill
      const grad = ctx.createLinearGradient(0, y, 0, padT + chartH);
      grad.addColorStop(0,   'rgba(56, 189, 248, 0.9)');
      grad.addColorStop(1,   'rgba(16, 185, 129, 0.5)');
      ctx.fillStyle = val > 0 ? grad : 'rgba(255,255,255,0.04)';

      const radius = Math.min(4, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, y);
      ctx.lineTo(x + barW - radius, y);
      ctx.quadraticCurveTo(x + barW, y, x + barW, y + radius);
      ctx.lineTo(x + barW, padT + chartH);
      ctx.lineTo(x, padT + chartH);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.closePath();
      ctx.fill();

      // Bar value label
      if (val > 0) {
        ctx.fillStyle  = '#f8fafc';
        ctx.font       = `bold ${11}px Inter, sans-serif`;
        ctx.textAlign  = 'center';
        ctx.fillText(val, x + barW / 2, y - 4);
      }

      // Hour label (X axis)
      ctx.fillStyle  = 'rgba(148,163,184,0.8)';
      ctx.font       = `${11}px Inter, sans-serif`;
      ctx.textAlign  = 'center';
      ctx.fillText(`${hour}時`, x + barW / 2, H - 8);
    });
  }

  // ── Order History Table ──────────────────────────────
  const tbody = document.getElementById('sales-orders-body');
  if (orders.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="color:var(--text-muted);padding:20px;text-align:center;">注文データがありません</td></tr>`;
  } else {
    // Show newest first
    const sorted = [...orders].reverse();
    tbody.innerHTML = sorted.map(order => {
      const timeStr  = new Date(order.time).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
      const itemsStr = (order.items || []).map(i => `${i.name}(${i.flavor})`).join(', ');
      const packs    = (order.items || []).reduce((s, i) => s + i.qty, 0);
      const revenue  = packs * PRICE_PER_PACK;
      const statusMap = { pending: '<span class="status-badge status-pending">受付中</span>', ready: '<span class="status-badge status-ready">呼出中</span>', completed: '<span class="status-badge status-completed">完了</span>' };
      const badge    = statusMap[order.status] || '';
      return `
        <tr>
          <td style="font-weight:700;color:var(--accent-blue);">${order.formattedId}</td>
          <td style="color:var(--text-secondary);">${timeStr}</td>
          <td>${itemsStr}</td>
          <td style="text-align:center;">${packs}</td>
          <td style="color:var(--accent-green);font-weight:600;">¥${revenue.toLocaleString()}</td>
          <td>${badge}</td>
        </tr>`;
    }).join('');
  }
};
