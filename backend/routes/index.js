const express = require("express");
const cors    = require("cors");
const dotenv  = require("dotenv");
const path    = require("path");
const fs      = require("fs");

dotenv.config();

const app  = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.FRONTEND_URL || "http://localhost:5173" }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

["uploads", "uploads/tmp", "data"].forEach((dir) => {
  const dirPath = path.join(__dirname, dir);
  if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Routes
app.use("/api/jobs",    require("./routes/jobs"));
app.use("/api/email",   require("./routes/email"));
app.use("/api",         require("./routes/process"));   // ← ADD THIS LINE

app.get("/", (req, res) => {
  res.json({ status: "✅ Job App Backend Running" });
});

app.listen(PORT, () => {
  console.log(`\n🚀 Backend running at http://localhost:${PORT}`);
  console.log(`📧 Email: ${process.env.EMAIL_USER || "NOT SET"}`);
  console.log(`👤 Name:  ${process.env.YOUR_NAME  || "NOT SET — add YOUR_NAME to .env"}`);
  console.log(`🤖 OpenAI: ${process.env.OPENAI_API_KEY ? "Connected" : "Not set (template fallback)"}\n`);
});