require("dotenv").config();
const express = require("express");
const path = require("path");
const postgres = require("postgres");

const app = express();
const PORT = process.env.PORT || 3000;

// Neon Connection Setup
const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error("FATAL ERROR: DATABASE_URL environment variable is not defined.");
}

const sql = postgres(connectionString);

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets (handles both local directory and Vercel serverless environment)
app.use(express.static(path.join(__dirname, "public")));
app.use(express.static(path.join(process.cwd(), "public")));
app.use(express.static(process.cwd()));

// Categories Endpoint
const SIDEBAR_CATEGORIES = [
  { id: "soft-drinks", name: "Soft Drinks", type: "Soft", icon: "🥤" },
  { id: "bar-items", name: "Bar Items", type: "Bar", icon: "🍸" },
  { id: "kitchen-items", name: "Kitchen Items", type: "Kic", icon: "🍳" },
];

app.get("/api/categories", (req, res) => {
  res.json(SIDEBAR_CATEGORIES);
});

// Stock Items API Endpoint
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

// Root & Fallback HTML Handler
const sendIndexPage = (req, res) => {
  const publicIndex = path.join(__dirname, "public", "index.html");
  const rootIndex = path.join(process.cwd(), "index.html");

  res.sendFile(publicIndex, (err) => {
    if (err) {
      res.sendFile(rootIndex, (fallbackErr) => {
        if (fallbackErr) {
          res.status(404).send("index.html not found");
        }
      });
    }
  });
};

app.get("/", sendIndexPage);

// Catch-all route for frontend SPA routing
app.use(sendIndexPage);

// Export for Vercel Serverless Function
module.exports = app;

// Local Development Listener
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running locally at http://localhost:${PORT}`);
  });
}
