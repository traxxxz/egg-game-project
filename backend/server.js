
const express = require("express");
const cors = require("cors");
const fs = require("fs");
const path = require("path");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const mammoth = require("mammoth");
const pdfParse = require("pdf-parse");
const { v4: uuidv4 } = require("uuid");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const DATA_PATH = path.join(__dirname, "data", "db.json");
const upload = multer({ dest: path.join(__dirname, "uploads") });

app.use(cors());
app.use(express.json());

function ensureDb() {
  if (fs.existsSync(DATA_PATH)) return;
  const adminPasswordHash = bcrypt.hashSync("admin123", 10);
  const db = {
    users: [
      {
        id: uuidv4(),
        displayName: "Admin",
        username: "admin",
        passwordHash: adminPasswordHash,
        role: "admin",
        emoji: "👑",
        permissions: {
          manageGame: true,
          manageContent: true,
          manageUsers: true,
          exportImport: true
        }
      }
    ],
    contents: {
      questions: [
        {
          id: uuidv4(),
          category: "ثقافة عامة",
          type: "اختيار من متعدد",
          question: "ما عاصمة السعودية؟",
          answer: "الرياض",
          options: ["الرياض", "جدة", "الدمام", "أبها"]
        },
        {
          id: uuidv4(),
          category: "جغرافيا",
          type: "سؤال مباشر",
          question: "ما عاصمة فرنسا؟",
          answer: "باريس",
          options: []
        }
      ],
      challenges: [
        {
          id: uuidv4(),
          category: "سرعة",
          rule: "اذكر 3 ألوان خلال 10 ثوان",
          text: "اذكر 3 ألوان بسرعة"
        }
      ],
      events: [
        {
          id: uuidv4(),
          category: "افتتاحية",
          emoji: "🎉",
          text: "كل لاعب يعرّف نفسه بجملة واحدة مبتكرة"
        }
      ]
    },
    gameState: {
      round: 1,
      players: [],
      history: []
    },
    archives: []
  };
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function readDb() {
  return JSON.parse(fs.readFileSync(DATA_PATH, "utf-8"));
}

function writeDb(db) {
  fs.writeFileSync(DATA_PATH, JSON.stringify(db, null, 2), "utf-8");
}

function makeToken(user) {
  return jwt.sign({
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions
  }, JWT_SECRET, { expiresIn: "7d" });
}

function auth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Unauthorized" });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

function hasPerm(user, key) {
  if (user.role === "admin") return true;
  return !!user.permissions?.[key];
}

function requirePerm(key) {
  return (req, res, next) => {
    if (!hasPerm(req.user, key)) return res.status(403).json({ error: "Forbidden" });
    next();
  };
}

function sanitizeUser(user) {
  return {
    id: user.id,
    displayName: user.displayName,
    username: user.username,
    role: user.role,
    emoji: user.emoji,
    permissions: user.permissions
  };
}

function archiveSnapshot(db, user, action, extra = {}) {
  let record = db.archives.find(x => x.ownerUsername === user.username && x.closed === false);
  if (!record) {
    record = {
      id: uuidv4(),
      ownerUsername: user.username,
      ownerDisplayName: user.displayName || user.username,
      startedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      closed: false,
      rounds: []
    };
    db.archives.push(record);
  }
  record.updatedAt = new Date().toISOString();
  record.rounds.push({
    id: uuidv4(),
    at: new Date().toISOString(),
    action,
    extra,
    snapshot: db.gameState
  });
}

function chooseRandom(arr) {
  return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
}

function parseBulkQuestions(rawText) {
  const normalized = rawText.replace(/\r/g, "");
  const blocks = normalized.split(/السؤال:/g).map(x => x.trim()).filter(Boolean);
  const results = [];

  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map(x => x.trim())
      .filter(Boolean)
      .filter(x => !/^[-–—\s]+$/.test(x));

    if (!lines.length) continue;

    const questionLine = lines[0];
    const optionLines = lines
      .slice(1)
      .map(x => x.replace(/^[0-9]+\s*[-.)]?\s*/, "").trim())
      .filter(Boolean);

    results.push({
      id: uuidv4(),
      category: "مستورد",
      type: optionLines.length > 1 ? "اختيار من متعدد" : "سؤال مباشر",
      question: questionLine,
      answer: optionLines.length ? optionLines[0] : "",
      options: optionLines
    });
  }

  return results;
}

async function readUploadedFileText(filePath, originalName) {
  const ext = path.extname(originalName).toLowerCase();
  if (ext === ".txt") {
    return fs.readFileSync(filePath, "utf-8");
  }
  if (ext === ".pdf") {
    const buffer = fs.readFileSync(filePath);
    const parsed = await pdfParse(buffer);
    return parsed.text || "";
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    return result.value || "";
  }
  throw new Error("Unsupported file type");
}

ensureDb();

app.post("/api/auth/login", (req, res) => {
  const { scope, username, password } = req.body || {};
  const db = readDb();
  const user = db.users.find(u => u.username === username);
  if (!user) return res.status(401).json({ error: "Invalid credentials" });
  const ok = bcrypt.compareSync(password, user.passwordHash);
  if (!ok) return res.status(401).json({ error: "Invalid credentials" });

  const scopeOk =
    (scope === "admin" && ["admin", "supervisor"].includes(user.role)) ||
    (scope === "subscriber" && user.role === "subscriber") ||
    (scope === "member" && user.role === "member");

  if (!scopeOk) return res.status(403).json({ error: "Wrong scope" });

  return res.json({ token: makeToken(user), user: sanitizeUser(user) });
});

app.post("/api/auth/register-member", (req, res) => {
  const db = readDb();
  const { displayName, username, password, emoji } = req.body || {};
  if (!displayName || !username || !password) return res.status(400).json({ error: "Missing fields" });
  if (db.users.some(u => u.username === username)) return res.status(400).json({ error: "Username exists" });

  db.users.push({
    id: uuidv4(),
    displayName,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role: "member",
    emoji: emoji || "🎮",
    permissions: {
      manageGame: true,
      manageContent: false,
      manageUsers: false,
      exportImport: false
    }
  });
  writeDb(db);
  res.json({ message: "تم إنشاء حساب العضو" });
});

app.get("/api/content/stats", auth, (req, res) => {
  const db = readDb();
  res.json({
    questions: db.contents.questions.length,
    challenges: db.contents.challenges.length,
    events: db.contents.events.length
  });
});

app.get("/api/game/state", auth, (req, res) => {
  const db = readDb();
  res.json({ game: db.gameState });
});

app.post("/api/game/players", auth, requirePerm("manageGame"), (req, res) => {
  const { name, emoji } = req.body || {};
  if (!name) return res.status(400).json({ error: "Name required" });
  const db = readDb();
  db.gameState.players.push({ id: uuidv4(), name, emoji: emoji || "🎤", score: 0 });
  archiveSnapshot(db, req.user, "add_player", { name });
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/game/score", auth, requirePerm("manageGame"), (req, res) => {
  const { playerId, delta } = req.body || {};
  const db = readDb();
  const player = db.gameState.players.find(p => p.id === playerId);
  if (!player) return res.status(404).json({ error: "Player not found" });
  player.score = Math.max(0, player.score + Number(delta || 0));
  archiveSnapshot(db, req.user, "score_change", { playerId, delta });
  writeDb(db);
  res.json({ ok: true, player });
});

app.post("/api/game/next-round", auth, requirePerm("manageGame"), (req, res) => {
  const db = readDb();
  db.gameState.round += 1;
  archiveSnapshot(db, req.user, "next_round", { round: db.gameState.round });
  writeDb(db);
  res.json({ ok: true, round: db.gameState.round });
});

app.get("/api/content/random", auth, (req, res) => {
  const db = readDb();
  const type = req.query.type;
  let item = null;
  if (type === "quiz") item = chooseRandom(db.contents.questions);
  if (type === "challenge") item = chooseRandom(db.contents.challenges);
  if (type === "event") item = chooseRandom(db.contents.events);
  res.json({ item });
});

app.post("/api/content", auth, requirePerm("manageContent"), (req, res) => {
  const db = readDb();
  const { type, category, meta, text } = req.body || {};
  if (!text) return res.status(400).json({ error: "Text required" });

  if (type === "question") {
    db.contents.questions.push({
      id: uuidv4(),
      category: category || "عام",
      type: "سؤال مباشر",
      question: text,
      answer: meta || "",
      options: []
    });
  } else if (type === "challenge") {
    db.contents.challenges.push({
      id: uuidv4(),
      category: category || "عام",
      rule: meta || "بدون شرط",
      text
    });
  } else if (type === "event") {
    db.contents.events.push({
      id: uuidv4(),
      category: category || "عام",
      emoji: meta || "🎉",
      text
    });
  } else {
    return res.status(400).json({ error: "Invalid type" });
  }

  archiveSnapshot(db, req.user, "add_content", { type, category });
  writeDb(db);
  res.json({ ok: true });
});

app.post("/api/content/bulk-upload", auth, requirePerm("manageContent"), upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const text = await readUploadedFileText(req.file.path, req.file.originalname);
    const questions = parseBulkQuestions(text);
    const db = readDb();
    db.contents.questions.push(...questions);
    archiveSnapshot(db, req.user, "bulk_question_import", { added: questions.length });
    writeDb(db);
    fs.unlinkSync(req.file.path);
    res.json({ ok: true, added: questions.length });
  } catch (error) {
    if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
    res.status(400).json({ error: "Failed to parse file" });
  }
});

app.get("/api/users", auth, requirePerm("manageUsers"), (req, res) => {
  const db = readDb();
  res.json({ users: db.users.map(sanitizeUser) });
});

app.post("/api/users", auth, requirePerm("manageUsers"), (req, res) => {
  const db = readDb();
  const { displayName, username, password, role } = req.body || {};
  if (!displayName || !username || !password || !role) return res.status(400).json({ error: "Missing fields" });
  if (db.users.some(u => u.username === username)) return res.status(400).json({ error: "Username exists" });

  db.users.push({
    id: uuidv4(),
    displayName,
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    role,
    emoji: role === "supervisor" ? "🛡️" : "💎",
    permissions: {
      manageGame: true,
      manageContent: false,
      manageUsers: false,
      exportImport: false
    }
  });
  writeDb(db);
  res.json({ ok: true });
});

app.put("/api/users/:id/permissions", auth, requirePerm("manageUsers"), (req, res) => {
  const db = readDb();
  const user = db.users.find(u => u.id === req.params.id);
  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.role !== "supervisor") return res.status(400).json({ error: "Only supervisors can be updated" });
  user.permissions = req.body.permissions || user.permissions;
  writeDb(db);
  res.json({ ok: true });
});

app.get("/api/archive/my", auth, (req, res) => {
  const db = readDb();
  const games = db.archives.filter(x => x.ownerUsername === req.user.username);
  res.json({ games });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
