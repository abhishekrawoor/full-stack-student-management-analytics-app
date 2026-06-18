const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret-in-production";
const PUBLIC_DIR = path.join(__dirname, "public");
const DATA_DIR = path.join(__dirname, "data");
const DB_FILE = path.join(DATA_DIR, "database.json");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};

const sampleStudents = [
  { id: id(), name: "Aarav Sharma", rollNo: "STU001", className: "10A", marks: 92, status: "Pass", createdAt: "2026-01-04T10:00:00.000Z" },
  { id: id(), name: "Diya Patel", rollNo: "STU002", className: "10B", marks: 86, status: "Pass", createdAt: "2026-01-08T10:00:00.000Z" },
  { id: id(), name: "Kabir Singh", rollNo: "STU003", className: "9A", marks: 73, status: "Pass", createdAt: "2026-02-02T10:00:00.000Z" },
  { id: id(), name: "Meera Nair", rollNo: "STU004", className: "9B", marks: 58, status: "Pass", createdAt: "2026-02-12T10:00:00.000Z" },
  { id: id(), name: "Rohan Das", rollNo: "STU005", className: "8A", marks: 34, status: "Fail", createdAt: "2026-03-03T10:00:00.000Z" },
  { id: id(), name: "Anika Rao", rollNo: "STU006", className: "8B", marks: 96, status: "Pass", createdAt: "2026-03-17T10:00:00.000Z" }
];

ensureDatabase();

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }

    serveStatic(req, res);
  } catch (error) {
    console.error(error);
    sendJson(res, 500, { message: "Internal server error" });
  }
});

server.listen(PORT, () => {
  console.log(`Student Management app running at http://localhost:${PORT}`);
});

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const method = req.method;

  if (method === "POST" && url.pathname === "/api/auth/register") {
    const body = await readJsonBody(req);
    return register(res, body);
  }

  if (method === "POST" && url.pathname === "/api/auth/login") {
    const body = await readJsonBody(req);
    return login(res, body);
  }

  const user = authenticate(req);

  if (!user) {
    return sendJson(res, 401, { message: "Unauthorized" });
  }

  if (method === "GET" && url.pathname === "/api/auth/me") {
    return sendJson(res, 200, { user });
  }

  if (method === "GET" && url.pathname === "/api/students") {
    const db = readDb();
    return sendJson(res, 200, { students: db.students });
  }

  if (method === "POST" && url.pathname === "/api/students") {
    const body = await readJsonBody(req);
    return createStudent(res, body);
  }

  const studentRoute = url.pathname.match(/^\/api\/students\/([a-zA-Z0-9-]+)$/);
  if (studentRoute && method === "PUT") {
    const body = await readJsonBody(req);
    return updateStudent(res, studentRoute[1], body);
  }

  if (studentRoute && method === "DELETE") {
    return deleteStudent(res, studentRoute[1]);
  }

  if (method === "GET" && url.pathname === "/api/analytics") {
    const db = readDb();
    return sendJson(res, 200, buildAnalytics(db.students));
  }

  sendJson(res, 404, { message: "API route not found" });
}

function register(res, body) {
  const name = clean(body.name);
  const email = clean(body.email).toLowerCase();
  const password = String(body.password || "");

  if (!name || !email || password.length < 6) {
    return sendJson(res, 400, { message: "Name, valid email, and 6+ character password are required" });
  }

  const db = readDb();
  if (db.users.some((user) => user.email === email)) {
    return sendJson(res, 409, { message: "Email is already registered" });
  }

  const user = {
    id: id(),
    name,
    email,
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString()
  };

  db.users.push(user);
  writeDb(db);

  const token = signJwt({ id: user.id, name: user.name, email: user.email });
  sendJson(res, 201, { token, user: publicUser(user) });
}

function login(res, body) {
  const email = clean(body.email).toLowerCase();
  const password = String(body.password || "");
  const db = readDb();
  const user = db.users.find((item) => item.email === email);

  if (!user || !verifyPassword(password, user.passwordHash)) {
    return sendJson(res, 401, { message: "Invalid email or password" });
  }

  const token = signJwt({ id: user.id, name: user.name, email: user.email });
  sendJson(res, 200, { token, user: publicUser(user) });
}

function createStudent(res, body) {
  const validation = validateStudent(body);
  if (validation.error) {
    return sendJson(res, 400, { message: validation.error });
  }

  const db = readDb();
  if (db.students.some((student) => student.rollNo.toLowerCase() === validation.student.rollNo.toLowerCase())) {
    return sendJson(res, 409, { message: "Roll number already exists" });
  }

  const student = {
    id: id(),
    ...validation.student,
    createdAt: new Date().toISOString()
  };

  db.students.push(student);
  writeDb(db);
  sendJson(res, 201, { student });
}

function updateStudent(res, studentId, body) {
  const validation = validateStudent(body);
  if (validation.error) {
    return sendJson(res, 400, { message: validation.error });
  }

  const db = readDb();
  const index = db.students.findIndex((student) => student.id === studentId);

  if (index === -1) {
    return sendJson(res, 404, { message: "Student not found" });
  }

  const duplicate = db.students.some((student) => {
    return student.id !== studentId && student.rollNo.toLowerCase() === validation.student.rollNo.toLowerCase();
  });

  if (duplicate) {
    return sendJson(res, 409, { message: "Roll number already exists" });
  }

  db.students[index] = {
    ...db.students[index],
    ...validation.student,
    updatedAt: new Date().toISOString()
  };

  writeDb(db);
  sendJson(res, 200, { student: db.students[index] });
}

function deleteStudent(res, studentId) {
  const db = readDb();
  const before = db.students.length;
  db.students = db.students.filter((student) => student.id !== studentId);

  if (db.students.length === before) {
    return sendJson(res, 404, { message: "Student not found" });
  }

  writeDb(db);
  sendJson(res, 200, { message: "Student deleted" });
}

function validateStudent(body) {
  const name = clean(body.name);
  const rollNo = clean(body.rollNo);
  const className = clean(body.className);
  const marks = Number(body.marks);

  if (!name || !rollNo || !className || !Number.isFinite(marks)) {
    return { error: "Name, roll number, class, and marks are required" };
  }

  if (marks < 0 || marks > 100) {
    return { error: "Marks must be between 0 and 100" };
  }

  return {
    student: {
      name,
      rollNo,
      className,
      marks,
      status: marks >= 35 ? "Pass" : "Fail"
    }
  };
}

function buildAnalytics(students) {
  const totalStudents = students.length;
  const totalMarks = students.reduce((sum, student) => sum + Number(student.marks), 0);
  const passCount = students.filter((student) => student.status === "Pass").length;
  const failCount = totalStudents - passCount;
  const averageMarks = totalStudents ? Number((totalMarks / totalStudents).toFixed(2)) : 0;
  const passPercentage = totalStudents ? Number(((passCount / totalStudents) * 100).toFixed(2)) : 0;
  const topPerformers = [...students].sort((a, b) => b.marks - a.marks).slice(0, 5);

  const classMap = new Map();
  students.forEach((student) => {
    if (!classMap.has(student.className)) {
      classMap.set(student.className, []);
    }
    classMap.get(student.className).push(student);
  });

  const classAverages = [...classMap.entries()].map(([className, items]) => ({
    label: className,
    value: Number((items.reduce((sum, student) => sum + student.marks, 0) / items.length).toFixed(2))
  }));

  const monthMap = new Map();
  students.forEach((student) => {
    const date = new Date(student.createdAt || Date.now());
    const label = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(label, (monthMap.get(label) || 0) + 1);
  });

  const monthlyAdmissions = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([label, value]) => ({ label, value }));

  return {
    summary: {
      totalStudents,
      averageMarks,
      passPercentage,
      passCount,
      failCount
    },
    topPerformers,
    charts: {
      classAverages,
      passFail: [
        { label: "Pass", value: passCount },
        { label: "Fail", value: failCount }
      ],
      monthlyAdmissions
    }
  };
}

function authenticate(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return null;

  try {
    return verifyJwt(token);
  } catch {
    return null;
  }
}

function signJwt(payload) {
  const header = { alg: "HS256", typ: "JWT" };
  const fullPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24
  };
  const encodedHeader = base64UrlEncode(JSON.stringify(header));
  const encodedPayload = base64UrlEncode(JSON.stringify(fullPayload));
  const signature = createHmac(`${encodedHeader}.${encodedPayload}`);
  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyJwt(token) {
  const [encodedHeader, encodedPayload, signature] = token.split(".");
  if (!encodedHeader || !encodedPayload || !signature) {
    throw new Error("Invalid token");
  }

  const expectedSignature = createHmac(`${encodedHeader}.${encodedPayload}`);
  const valid = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature));
  if (!valid) {
    throw new Error("Invalid signature");
  }

  const payload = JSON.parse(base64UrlDecode(encodedPayload));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error("Expired token");
  }

  return { id: payload.id, name: payload.name, email: payload.email };
}

function createHmac(value) {
  return crypto.createHmac("sha256", JWT_SECRET).update(value).digest("base64url");
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hash] = String(storedHash).split(":");
  if (!salt || !hash) return false;

  const candidate = crypto.pbkdf2Sync(password, salt, 100000, 64, "sha512").toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash), Buffer.from(candidate));
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const requestedPath = url.pathname === "/" ? "/index.html" : url.pathname;
  const safePath = path.normalize(requestedPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(PUBLIC_DIR, safePath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      return res.end("<h1>404 - Not Found</h1>");
    }

    const type = MIME_TYPES[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type });
    res.end(content);
  });
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
      if (data.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request body too large"));
      }
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function ensureDatabase() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(DB_FILE)) {
    writeDb({ users: [], students: sampleStudents });
  }
}

function readDb() {
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}

function writeDb(db) {
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

function clean(value) {
  return String(value || "").trim();
}

function publicUser(user) {
  return { id: user.id, name: user.name, email: user.email };
}

function id() {
  return crypto.randomUUID();
}

function base64UrlEncode(value) {
  return Buffer.from(value).toString("base64url");
}

function base64UrlDecode(value) {
  return Buffer.from(value, "base64url").toString("utf8");
}
