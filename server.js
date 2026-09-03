const express = require("express");
const path = require("path");
const postgres = require("postgres");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// Lazy Database Connection Manager (prevents top-level serverless crashes)
let sql;
function getDb() {
  if (!sql) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error("DATABASE_URL environment variable is missing in Vercel settings.");
    }
    sql = postgres(connectionString, {
      ssl: { rejectUnauthorized: false },
      connect_timeout: 10,
      max: 10
    });
  }
  return sql;
}

// Middleware Configuration
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets for local development
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.static(process.cwd()));

// --- OPTION 2: Explicit Static File Fallback Routes for Vercel ---
app.get("/script.js", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "script.js"), (err) => {
    if (err) res.sendFile(path.join(process.cwd(), "script.js"));
  });
});

app.get("/style.css", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "style.css"), (err) => {
    if (err) res.sendFile(path.join(process.cwd(), "style.css"));
  });
});

app.get("/favicon.ico", (req, res) => {
  res.sendFile(path.join(process.cwd(), "public", "favicon.ico"), (err) => {
    if (err) res.sendFile(path.join(process.cwd(), "favicon.ico"), (err2) => {
      if (err2) res.status(204).end(); // Silent fallback if no icon exists
    });
  });
});
// -----------------------------------------------------------------

const SIDEBAR_CATEGORIES = [
  { id: "soft-drinks", name: "Soft Drinks", type: "Soft", icon: "🥤" },
  { id: "bar-items", name: "Bar Items", type: "Bar", icon: "🍸" },
  { id: "kitchen-items", name: "Kitchen Items", type: "Kic", icon: "🍳" },
];

// API Routes
app.get("/api/categories", (req, res) => {
  res.json(SIDEBAR_CATEGORIES);
});

// Fetch Stock Items with Category & Today Special Filtering
app.get("/api/stock-mast", async (req, res) => {
  try {
    const db = getDb();
    const { item_type, td_special } = req.query;

    let rows;

    if (item_type && td_special) {
      rows = await db`
        SELECT * FROM stock_mast 
        WHERE LOWER(TRIM(item_type)) = LOWER(TRIM(${item_type}))
          AND LOWER(TRIM(CAST(td_special AS TEXT))) IN ('true', '1', 't', 'yes', 'y')
        ORDER BY LOWER(TRIM(it_desc)), item_size ASC
      `;
    } else if (td_special) {
      rows = await db`
        SELECT * FROM stock_mast 
        WHERE LOWER(TRIM(CAST(td_special AS TEXT))) IN ('true', '1', 't', 'yes', 'y')
        ORDER BY LOWER(TRIM(it_desc)), item_size ASC
      `;
    } else if (item_type) {
      rows = await db`
        SELECT * FROM stock_mast 
        WHERE LOWER(TRIM(item_type)) = LOWER(TRIM(${item_type}))
        ORDER BY LOWER(TRIM(it_desc)), item_size ASC
      `;
    } else {
      rows = await db`
        SELECT * FROM stock_mast 
        ORDER BY LOWER(TRIM(it_desc)), item_size ASC
      `;
    }

    const groupedMap = new Map();

    rows.forEach((row) => {
      const name = String(row.it_desc || row.IT_DESC || "Unknown").trim();
      const cat = String(row.item_cat || row.ITEM_CAT || "General").trim();
      const pic = String(row.pic_link || row.PIC_LINK || "").trim();
      const type = String(row.item_type || row.ITEM_TYPE || "").trim();

      const rawSpecial = row.td_special ?? "";
      const specialVal = String(rawSpecial).toLowerCase().trim();
      const isTodaySpecial = ['true', '1', 't', 'yes', 'y'].includes(specialVal);

      const priceVal = parseFloat(row.it_uprise_sal || row.price || row.price_std) || 0;

      const variation = {
        it_code: String(row.it_code || "").trim(),
        item_size: String(row.item_size || "").trim(),
        price: priceVal,
        stock: parseFloat(row.stock_in_hnd || row.stock) || 0
      };

      if (!groupedMap.has(name)) {
        groupedMap.set(name, {
          item_name: name,
          item_cat: cat,
          pic_link: pic,
          item_type: type,
          price: priceVal,
          td_special: isTodaySpecial,
          variations: [variation]
        });
      } else {
        groupedMap.get(name).variations.push(variation);
      }
    });

    res.json(Array.from(groupedMap.values()));
  } catch (error) {
    console.error("Database Query Error:", error.message);
    res.status(500).json({ error: "Database Query Error", message: error.message });
  }
});

// Order Placement API
app.post("/api/place-order", async (req, res) => {
  try {
    const db = getDb();
    const { 
      alreadyEntered, 
      tableNo, 
      phoneNo, 
      items, 
      table_no, 
      teleno, 
      phone, 
      reachTime, 
      paymentMethod 
    } = req.body;

    const effectiveTableNo = alreadyEntered !== false ? (tableNo || table_no || "01") : "PRE-ORDER";
    const effectivePhoneNo = phoneNo || teleno || phone || "";
    const effectiveReachTime = reachTime || "";
    const reqNo = `R${Date.now().toString().slice(-9)}`;
    const now = new Date();

    const orderItems = (items && Array.isArray(items) && items.length > 0) 
      ? items 
      : [{ name: "General Order", it_code: "ORD01", size: "STD", qty: 1, price: 0 }];

    await db.begin(async (trx) => {
      for (const item of orderItems) {
        const safeReqNo = String(reqNo).substring(0, 50);
        const safeTableNo = String(effectiveTableNo).substring(0, 20);
        const safeItCode = String(item.it_code || item.code || "ITEM").substring(0, 50);
        const safeSize = String(item.size || item.item_size || "STD").substring(0, 20);
        const safeQty = parseFloat(item.qty || item.quantity) || 1;
        const safeDesc = String(item.name || item.it_desc || "Item Description");
        const safePhone = String(effectivePhoneNo).replace(/\s+/g, '').substring(0, 20);
        const safeReachTime = String(effectiveReachTime).substring(0, 30);
        const safePayMethod = String(paymentMethod || 'cash').substring(0, 20);

        try {
          await trx`
            INSERT INTO ord_req (
              req_no, req_date, req_date1, table_no, it_code, 
              item_size, qty, it_desc, req_ok, teleno, reach_time, pay_method
            )
            VALUES (
              ${safeReqNo}, ${now}, ${now}, ${safeTableNo}, ${safeItCode}, 
              ${safeSize}, ${safeQty}, ${safeDesc}, ${false}, ${safePhone}, 
              ${safeReachTime}, ${safePayMethod}
            )
          `;
        } catch (dbErr) {
          await trx`
            INSERT INTO ord_req (req_no, req_date, req_date1, table_no, it_code, item_size, qty, it_desc, req_ok, teleno)
            VALUES (${safeReqNo}, ${now}, ${now}, ${safeTableNo}, ${safeItCode}, ${safeSize}, ${safeQty}, ${safeDesc}, ${false}, ${safePhone})
          `;
        }
      }
    });

    return res.json({ success: true, reqNo, message: "Order placed successfully!" });
  } catch (error) {
    console.error("Order Insertion Error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to place order", details: error.message });
  }
});

// Root Fallback Route
app.get("/", (req, res) => {
  res.sendFile(path.join(process.cwd(), "index.html"), (err) => {
    if (err) {
      res.sendFile(path.join(process.cwd(), "public", "index.html"));
    }
  });
});

module.exports = app;

if (require.main === module) {
  app.listen(PORT, () => console.log(`Server running at http://localhost:${PORT}`));
}
