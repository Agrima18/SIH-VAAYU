// ===================== ENV & MODULES =====================
require('dotenv').config();
const express = require("express");
const path = require("path");
const http = require('http');
const fetch = (...args) => import('node-fetch').then(({ default: fetch }) => fetch(...args));
const expressLayouts = require('express-ejs-layouts');
const mongoose = require("mongoose");
const session = require("express-session");
const MongoStore = require("connect-mongo");
const bcrypt = require("bcrypt");
const flash = require("connect-flash");

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// ===================== MIDDLEWARE =====================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(expressLayouts);
app.set('layout', 'layout/boilerplate');

// ===================== DATABASE =====================
mongoose.connect("mongodb://127.0.0.1:27017/wanderlust")
  .then(() => console.log("✅ MongoDB Connected"))
  .catch(err => console.log("❌ DB Connection Error:", err));

const sessionConfig = {
  store: MongoStore.create({ mongoUrl: "mongodb://127.0.0.1:27017/Delhiusers" }),
  secret: "secretcode",
  resave: false,
  saveUninitialized: true,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 },
};
app.use(session(sessionConfig));
app.use(flash());

// ===================== USER MODEL =====================
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  role: { type: String, enum: ["citizen", "government", "companies"], default: "citizen" }
});

// hash password before save
userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();
  this.password = await bcrypt.hash(this.password, 12);
  next();
});
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

const User = mongoose.model("User", userSchema);

// ===================== MIDDLEWARES =====================
function requireLogin(req, res, next) {
  if (!req.session.userId) return res.redirect("/listings/login");
  next();
}

// ===================== SAMPLE DATA =====================
const sampleAQI = {
  city: "Delhi",
  aqi: 180,
  dominantPollutant: "PM2.5",
  temp: 32,
  humidity: 50
};
const multipleLocations = [
  { city: "Delhi", lat: 28.6448, lng: 77.216721, aqi: 180 },
  { city: "Noida", lat: 28.5355, lng: 77.3910, aqi: 150 },
  { city: "Gurugram", lat: 28.4595, lng: 77.0266, aqi: 120 },
];
const touristSpots = [
  { name: "India Gate", lat: 28.6129, lng: 77.2295 },
  { name: "Red Fort", lat: 28.6562, lng: 77.2410 },
  { name: "Qutub Minar", lat: 28.5244, lng: 77.1855 },
];

// ===================== ROUTES =====================

// 🧠 Health Advisory Page
app.get("/views/health", requireLogin, (req, res) => {
  res.render("health");
});

// 🧠 AI Health Advice API
app.post("/api/health-advice", async (req, res) => {
  const { aqi, temp, age, hasCondition } = req.body;
  const prompt = `
You are a health advisor. Based on:
- AQI: ${aqi}
- Temperature: ${temp}°C
- Age: ${age}
- Pre-existing conditions: ${hasCondition}
Give 3 short, practical health recommendations (max 3 lines). Use emojis like ✅⚠️☠️.
`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();
    const advice = data.choices?.[0]?.message?.content || "⚠️ Unable to generate advice.";
    res.json({ advice });
  } catch (err) {
    console.error("AI API Error:", err);
    res.json({ advice: "⚠️ AI service unavailable." });
  }
});

// 🌫 AQI API
app.get("/api/aqi", async (req, res) => {
  const city = req.query.city || "Delhi";
  const url = `https://api.waqi.info/feed/${city}/?token=${process.env.AQICN_API_KEY}`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json({ aqi: data?.data?.aqi || 150 });
  } catch (err) {
    res.json({ aqi: 150 });
  }
});

// 🌦 Weather API
app.get("/api/weather", async (req, res) => {
  const city = req.query.city || "Delhi";
  const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`;
  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json({
      temp: data.main.temp,
      humidity: data.main.humidity,
      condition: data.weather[0].main
    });
  } catch (err) {
    res.json({ temp: 30, humidity: 50, condition: "Clear" });
  }
});

// 🤖 AI Air Recommendation Page
app.get("/views/airecommendation", requireLogin, (req, res) => {
  res.render("airecommendation", {
    city: "Delhi",
    aqi: 180,
    summary: "AI-based air quality analysis not yet generated. Use the health advisory to get personalized tips."
  });
});

// 👤 Citizen Dashboard
app.get("/views/citizen", requireLogin, async (req, res) => {
  const city = "Delhi";
  try {
    const aqiRes = await fetch(`https://api.waqi.info/feed/${city}/?token=${process.env.AQICN_API_KEY}`);
    const aqiData = await aqiRes.json();
    const weatherRes = await fetch(`https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${process.env.WEATHER_API_KEY}&units=metric`);
    const weatherData = await weatherRes.json();

    res.render("citizen", {
      city,
      aqi: aqiData?.data?.aqi || 150,
      dominantPollutant: aqiData?.data?.dominentpol || "PM2.5",
      temp: weatherData?.main?.temp || 30,
      humidity: weatherData?.main?.humidity || 50
    });
  } catch (err) {
    console.error("❌ Citizen route error:", err);
    res.render("citizen", {
      city,
      aqi: 150,
      dominantPollutant: "PM2.5",
      temp: 30,
      humidity: 50
    });
  }
});

// 📜 Policy Page
app.get("/views/policy", requireLogin, (req, res) => {
  res.render("policy", {
    title: "Air Quality & Health Policies",
    policies: [
      {
        heading: "🌿 National Clean Air Programme (NCAP)",
        content: "Aims to reduce PM2.5 and PM10 levels by 20–30% in cities by 2025."
      },
      {
        heading: "🚗 Vehicle Emission Standards (BS-VI)",
        content: "Mandates reduced sulfur content in fuels and improved vehicle technology."
      },
      {
        heading: "🏭 Industrial Emission Controls",
        content: "Requires Continuous Emission Monitoring Systems and clean fuel use."
      },
      {
        heading: "🏠 Citizen Participation",
        content: "Promotes public transport, tree planting, and avoiding open burning."
      },
      {
        heading: "⚖️ Right to Clean Air",
        content: "Recognized under Article 21 as a fundamental right."
      }
    ]
  });
});

// 🏠 Dashboard
app.get("/", (req, res) => res.redirect("/dashboard"));
app.get("/dashboard", requireLogin, (req, res) => {
  res.render("dashboard", {
    aqiData: sampleAQI,
    aqiLocations: multipleLocations,
    touristSpots,
    apiKey: process.env.AQICN_API_KEY
  });
});

// ===================== AUTH ROUTES =====================
app.get("/listings/register", (req, res) => res.render("listings/register"));
app.post("/listings/register", async (req, res) => {
  try {
    const { username, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.send("⚠️ Email already registered");
    const user = new User({ username, email, password, role });
    await user.save();
    req.session.userId = user._id;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Registration error:", err);
    res.status(500).send("Error registering user");
  }
});

app.get("/listings/login", (req, res) => res.render("listings/login"));
app.post("/listings/login", async (req, res) => {
  try {
    const { identifier, password } = req.body;
    const user = await User.findOne({ $or: [{ username: identifier }, { email: identifier }] });
    if (!user) return res.send("❌ User not found");
    const isMatch = await user.comparePassword(password);
    if (!isMatch) return res.send("❌ Invalid password");
    req.session.userId = user._id;
    res.redirect("/dashboard");
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).send("Error logging in");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/listings/login"));
});

// ===================== SERVER =====================
server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
