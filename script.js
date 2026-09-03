const tabs = document.querySelectorAll('.top-tab');
const subCatContainer = document.getElementById('sub-cat-container');
const gridContainer = document.getElementById('grid-container');
const dashboardContainer = document.getElementById('dashboard-container');
const toggleBillBtn = document.getElementById('toggle-bill-btn');
const billPanel = document.getElementById('bill-panel');
const todaySpecialTrack = document.getElementById('today-special-track');

let selectedPaymentMethod = 'cash';
let isAlreadyEntered = true;
let allCurrentData = [];
let cart = {};

toggleBillBtn.addEventListener('click', () => {
  billPanel.classList.toggle('active');
  toggleBillBtn.classList.toggle('active');
});

function selectPayment(method) {
  selectedPaymentMethod = method;
  document.getElementById('pay-cash-btn').classList.toggle('active', method === 'cash');
  document.getElementById('pay-card-btn').classList.toggle('active', method === 'card');
}

function setEnteredStatus(entered) {
  isAlreadyEntered = entered;

  document.getElementById('entered-yes-btn').classList.toggle('active', entered);
  document.getElementById('entered-no-btn').classList.toggle('active', !entered);

  const tableBox = document.getElementById('table-box');
  const reachTimeBox = document.getElementById('reach-time-box');

  if (entered) {
    tableBox.style.display = 'flex';
    reachTimeBox.style.display = 'none';
    document.getElementById('reach-time-input').value = '';
  } else {
    tableBox.style.display = 'none';
    reachTimeBox.style.display = 'flex';
    document.getElementById('table-no-input').value = '';
  }
}

function formatPhoneNumber(input) {
  let digits = input.value.replace(/\D/g, '');
  if (digits.length > 10) digits = digits.substring(0, 10);

  if (digits.length > 3) {
    input.value = `${digits.substring(0, 3)} ${digits.substring(3)}`;
  } else {
    input.value = digits;
  }
}

// Utility function to extract numerical price from multiple potential DB properties
function getValidPrice(item) {
  if (item.price !== undefined && item.price !== null && parseFloat(item.price) > 0) {
    return parseFloat(item.price);
  }
  if (item.price_std !== undefined && item.price_std !== null && parseFloat(item.price_std) > 0) {
    return parseFloat(item.price_std);
  }
  if (item.item_price !== undefined && item.item_price !== null && parseFloat(item.item_price) > 0) {
    return parseFloat(item.item_price);
  }
  if (item.variations && item.variations.length > 0) {
    const firstVarPrice = parseFloat(item.variations[0].price || item.variations[0].price_std || 0);
    if (firstVarPrice > 0) return firstVarPrice;
  }
  return 0;
}

// Fetch Today Special & Setup Infinite Marquee Track
async function loadTodaySpecial() {
  try {
    const res = await fetch(`/api/stock-mast?td_special=yes`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const data = await res.json();

    // Use items returned directly from backend (handles boolean conversion & SQL string filtering)
    const specials = data || [];

    if (specials.length === 0) {
      todaySpecialTrack.innerHTML = '<div class="status-msg" style="font-size:11px; padding-left:15px;">No specials available</div>';
      return;
    }

    const buildItemHTML = (item) => {
      const rawPrice = getValidPrice(item);
      const priceDisplay = rawPrice.toFixed(2);
      const safeName = item.item_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const itemType = item.item_type || '';
      const itemCat = (item.item_cat || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

      return `
        <div class="special-item-card" 
             style="cursor: pointer;"
             onclick="selectSpecialItem('${safeName}', '${itemType}', '${itemCat}')">
          <img class="special-img" src="${item.pic_link || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80'}" 
               alt="${item.item_name}" 
               onerror="this.src='https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80'" />
          <div class="special-info">
            <span class="special-name" title="${item.item_name}">${item.item_name}</span>
            <span class="special-price">Rs. ${priceDisplay}</span>
          </div>
        </div>
      `;
    };

    const listHTML = specials.map(buildItemHTML).join('');
    todaySpecialTrack.innerHTML = listHTML + listHTML;

    const totalItems = specials.length * 2;
    const speedInSeconds = Math.max(15, totalItems * 3);
    todaySpecialTrack.style.animationDuration = `${speedInSeconds}s`;

  } catch (err) {
    console.error("Today Special Fetch Error:", err);
    todaySpecialTrack.innerHTML = '<div class="status-msg" style="font-size:11px; padding-left:15px;">Failed to load specials.</div>';
  }
}

// Auto Search, Filter & Highlight Selected Special Item
async function selectSpecialItem(itemName, itemType, itemCat) {
  // 1. Activate matching top category tab if necessary
  const currentActiveTab = document.querySelector('.top-tab.active');
  const currentType = currentActiveTab ? currentActiveTab.getAttribute('data-type') : null;
  const targetTab = Array.from(tabs).find(t => t.getAttribute('data-type') === itemType);

  if (targetTab && currentType !== itemType) {
    tabs.forEach(t => t.classList.remove('active'));
    targetTab.classList.add('active');

    const glow = targetTab.getAttribute('data-glow');
    const border = targetTab.getAttribute('data-border');

    await loadCategoryData(itemType, glow, border);
  }

  // 2. Activate matching sub-category tab
  if (itemCat) {
    const subCatTabs = subCatContainer.querySelectorAll('.sub-cat-item');
    subCatTabs.forEach(sub => {
      if (sub.innerText.trim().toLowerCase() === itemCat.trim().toLowerCase()) {
        filterBySubCat(itemCat, sub);
      }
    });
  }

  // 3. Scroll to the card and trigger neon yellow highlight pulse
  setTimeout(() => {
    const cards = gridContainer.querySelectorAll('.category-card');
    cards.forEach(card => {
      const nameEl = card.querySelector('.category-name');
      if (nameEl && nameEl.innerText.trim().toLowerCase() === itemName.trim().toLowerCase()) {
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });

        card.style.transition = 'all 0.3s ease';
        card.style.borderColor = 'var(--neon-yellow)';
        card.style.boxShadow = '0 0 25px var(--neon-yellow)';

        setTimeout(() => {
          card.style.borderColor = '';
          card.style.boxShadow = '';
        }, 2500);
      }
    });
  }, 120);
}

async function loadCategoryData(type, glowColor, borderColor) {
  try {
    dashboardContainer.style.boxShadow = `0 0 30px ${glowColor}`;
    dashboardContainer.style.borderColor = borderColor;

    subCatContainer.innerHTML = '<div class="status-msg">Loading...</div>';
    gridContainer.innerHTML = '<div class="status-msg">Loading...</div>';

    const res = await fetch(`/api/stock-mast?item_type=${type}`);
    if (!res.ok) throw new Error(`HTTP error! status: ${res.status}`);

    const data = await res.json();
    allCurrentData = data;

    if (!data || data.length === 0) {
      subCatContainer.innerHTML = '<div class="status-msg">No categories</div>';
      gridContainer.innerHTML = '<div class="status-msg">No items found.</div>';
      return;
    }

    const categories = [...new Set(data.map(item => item.item_cat))].filter(Boolean);

    subCatContainer.innerHTML = categories.map((cat, idx) => `
      <div class="sub-cat-item ${idx === 0 ? 'active' : ''}" onclick="filterBySubCat('${cat}', this)">
        ${cat}
      </div>
    `).join('');

    if (categories.length > 0) {
      filterBySubCat(categories[0], subCatContainer.querySelector('.sub-cat-item'));
    } else {
      renderCards(data);
    }

  } catch (err) {
    console.error("Fetch Error:", err);
    subCatContainer.innerHTML = '<div class="status-msg">Error</div>';
    gridContainer.innerHTML = `<div class="status-msg">Failed to load data.</div>`;
  }
}

function filterBySubCat(category, element) {
  document.querySelectorAll('.sub-cat-item').forEach(el => el.classList.remove('active'));
  if (element) element.classList.add('active');

  const filtered = allCurrentData.filter(item => item.item_cat === category);
  renderCards(filtered);
}

function changeQty(itemName, sizeStr, priceVal, delta, itCode) {
  const cartKey = `${itemName}_${sizeStr}`;
  const inputEl = document.getElementById(`qty-${cartKey}`);
  const rowEl = document.getElementById(`row-${cartKey}`);

  let currentQty = parseInt(inputEl.value) || 0;
  currentQty += delta;
  if (currentQty < 0) currentQty = 0;

  inputEl.value = currentQty;

  if (currentQty > 0) {
    cart[cartKey] = { name: itemName, size: sizeStr, price: priceVal, qty: currentQty, it_code: itCode || itemName };
    if (rowEl) rowEl.classList.add('has-qty');
  } else {
    delete cart[cartKey];
    if (rowEl) rowEl.classList.remove('has-qty');
  }

  updateBillDrawer();
}

async function placeOrder() {
  const keys = Object.keys(cart);
  if (keys.length === 0) {
    alert("Please add at least one item to place an order.");
    return;
  }

  const rawPhoneNo = document.getElementById('phone-no-input').value.replace(/\s+/g, '').trim();
  const reachTime = document.getElementById('reach-time-input').value;
  const tableNo = document.getElementById('table-no-input').value.trim();

  if (isAlreadyEntered) {
    if (!tableNo) {
      alert("Enter Table No.");
      return;
    }
  } else {
    if (!rawPhoneNo || !reachTime) {
      alert("Enter Tel No & Reach Time");
      return;
    }
  }

  const placeOrderBtn = document.getElementById('btn-place-order');

  const itemsArray = keys.map(key => ({
    name: cart[key].name,
    size: cart[key].size,
    qty: cart[key].qty,
    price: cart[key].price,
    it_code: cart[key].it_code
  }));

  try {
    placeOrderBtn.disabled = true;
    placeOrderBtn.innerText = "SAVING...";

    const response = await fetch('/api/place-order', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        alreadyEntered: isAlreadyEntered,
        tableNo: isAlreadyEntered ? tableNo : null,
        reachTime: !isAlreadyEntered ? reachTime : null,
        phoneNo: rawPhoneNo,
        paymentMethod: selectedPaymentMethod,
        items: itemsArray
      })
    });

    const result = await response.json();

    if (response.ok && result.success) {
      alert(`Order Saved Successfully!\nReq No: ${result.reqNo}`);

      cart = {};
      updateBillDrawer();
      document.querySelectorAll('.qty-val').forEach(input => input.value = 0);
      document.querySelectorAll('.size-row').forEach(row => row.classList.remove('has-qty'));
      document.getElementById('table-no-input').value = '';
      document.getElementById('reach-time-input').value = '';
      document.getElementById('phone-no-input').value = '';
    } else {
      alert(`Failed to save order: ${result.details || result.error || 'Server Error'}`);
    }
  } catch (err) {
    console.error("Place Order API Error:", err);
    alert("Network Error: Could not reach server.");
  } finally {
    placeOrderBtn.disabled = false;
    placeOrderBtn.innerText = "PLACE ORDER";
  }
}

function updateBillDrawer() {
  const container = document.getElementById('bill-items-container');
  const totalValEl = document.getElementById('bill-total-val');

  const keys = Object.keys(cart);
  if (keys.length === 0) {
    container.innerHTML = '<p style="color:#888; font-size: 10px;">No items selected.</p>';
    totalValEl.innerText = '0.00';
    return;
  }

  let grandTotal = 0;
  let html = '';

  keys.forEach(key => {
    const item = cart[key];
    const itemTotal = item.price * item.qty;
    grandTotal += itemTotal;

    html += `
      <div class="bill-item-row">
        <div class="bill-item-info">
          <div class="bill-item-name" title="${item.name}">${item.name}</div>
          <div class="bill-item-size">(${item.size})</div>
        </div>
        <div class="bill-qty-badge">${item.qty}</div>
        <div class="bill-item-price">${itemTotal.toFixed(2)}</div>
      </div>
    `;
  });

  container.innerHTML = html;
  totalValEl.innerText = grandTotal.toFixed(2);
}

function renderCards(items) {
  if (!items || items.length === 0) {
    gridContainer.innerHTML = '<div class="status-msg">No items available.</div>';
    return;
  }

  gridContainer.innerHTML = items.map(item => {
    const fallbackPrice = getValidPrice(item);

    const variations = item.variations || [
      { item_size: 'L', price: fallbackPrice },
      { item_size: 'M', price: fallbackPrice },
      { item_size: 'S', price: fallbackPrice },
      { item_size: 'XS', price: fallbackPrice }
    ];

    const overlayHtml = variations.map(v => {
      const sizeStr = v.item_size || 'STD';
      const priceVal = parseFloat(v.price || fallbackPrice);
      const safeName = item.item_name.replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const safeCode = (v.it_code || item.item_name).replace(/'/g, "\\'").replace(/"/g, '&quot;');
      const cartKey = `${item.item_name}_${sizeStr}`;
      const currentVal = cart[cartKey] ? cart[cartKey].qty : 0;
      const hasQtyClass = currentVal > 0 ? 'has-qty' : '';

      return `
        <div class="size-row ${hasQtyClass}" id="row-${cartKey}">
          <span class="size-code">${sizeStr}</span>
          <div class="size-price-badge">
            <span class="price-tag">${priceVal.toFixed(2)}</span>
          </div>
          <div class="qty-stepper">
            <button class="qty-btn" onclick="changeQty('${safeName}', '${sizeStr}', ${priceVal}, -1, '${safeCode}')">-</button>
            <input type="number" id="qty-${cartKey}" class="qty-val" value="${currentVal}" readonly />
            <button class="qty-btn" onclick="changeQty('${safeName}', '${sizeStr}', ${priceVal}, 1, '${safeCode}')">+</button>
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="category-card">
        <div class="image-wrapper">
          <div class="size-overlay">${overlayHtml}</div>
          <img src="${item.pic_link || 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80'}" 
               alt="${item.item_name}" 
               onerror="this.src='https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80'" />
        </div>
        <div class="category-name">${item.item_name}</div>
      </div>
    `;
  }).join('');
}

tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    const itemType = tab.getAttribute('data-type');
    const glow = tab.getAttribute('data-glow');
    const border = tab.getAttribute('data-border');
    loadCategoryData(itemType, glow, border);
  });
});

// Initial Load Setup
document.addEventListener('DOMContentLoaded', () => {
  loadTodaySpecial();

  const activeTab = document.querySelector('.top-tab.active');
  if (activeTab) {
    const itemType = activeTab.getAttribute('data-type');
    const glow = activeTab.getAttribute('data-glow');
    const border = activeTab.getAttribute('data-border');
    loadCategoryData(itemType, glow, border);
  }
});