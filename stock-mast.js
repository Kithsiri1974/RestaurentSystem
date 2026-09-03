const express = require("express");
const path = require("path");
const postgres = require("postgres");

const app = express();
const PORT = process.env.PORT || 3000;

// Neon Connection String
const connectionString =
  process.env.DATABASE_URL ||
  "postgresql://neondb_owner:npg_G7Jzfr0cqdmk@ep-wandering-block-ax0pmalp-pooler.c-4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

const sql = postgres(connectionString);

// Serve static files
app.use(express.static(path.join(__dirname, "public")));

// Primary sidebar categories mapping
const SIDEBAR_CATEGORIES = [
  { id: "soft-drinks", name: "Soft Drinks", type: "Soft", icon: "🥤" },
  { id: "bar-items", name: "Bar Items", type: "Bar", icon: "🍸" },
  { id: "kitchen-items", name: "Kitchen Items", type: "Kic", icon: "🍳" },
];

app.get("/api/categories", (req, res) => {
  res.json(SIDEBAR_CATEGORIES);
});

// Stock Items API Endpoint returning items with grouped size variations
app.get("/api/stock-mast", async (req, res) => {
  try {
    const { item_type } = req.query;

    let rows;
    if (item_type) {
      rows = await sql`
        SELECT * FROM stock_mast 
        WHERE LOWER(TRIM(item_type)) = LOWER(${item_type.trim()})
        ORDER BY LOWER(TRIM(it_desc)), item_size ASC
      `;
    } else {
      rows = await sql`
        SELECT * FROM stock_mast 
        ORDER BY LOWER(TRIM(it_desc)), item_size ASC
      `;
    }

    // Group size variations by item name/description
    const groupedMap = new Map();

    rows.forEach((row) => {
      const name = String(row.it_desc || row.IT_DESC || "Unknown").trim();
      const cat = String(row.item_cat || row.ITEM_CAT || "General").trim();
      const pic = String(row.pic_link || row.PIC_LINK || "").trim();
      const type = String(row.item_type || row.ITEM_TYPE || "").trim();
      
      const variation = {
        it_code: String(row.it_code || "").trim(),
        item_size: String(row.item_size || "").trim(),
        price: parseFloat(row.it_uprise_sal) || 0,
        stock: parseFloat(row.stock_in_hnd) || 0
      };

      if (!groupedMap.has(name)) {
        groupedMap.set(name, {
          item_name: name,
          item_cat: cat,
          pic_link: pic,
          item_type: type,
          variations: [variation]
        });
      } else {
        groupedMap.get(name).variations.push(variation);
      }
    });

    const result = Array.from(groupedMap.values());
    console.log(`[API /api/stock-mast] Returning ${result.length} unique grouped items.`);
    res.json(result);
  } catch (error) {
    console.error("================ DATABASE ERROR ================");
    console.error(error.message);
    console.error("================================================");

    res.status(500).json({
      error: "Database Query Error",
      message: error.message,
    });
  }
});

// Fallback for SPA Routing
app.use((req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});