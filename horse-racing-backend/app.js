var createError = require("http-errors");
var express = require("express");
var path = require("path");
var cookieParser = require("cookie-parser");
var logger = require("morgan");

var indexRouter = require("./routes/index");
var usersRouter = require("./routes/users");
var authRouter = require("./routes/auth");
var adminUserRouter = require("./routes/adminUsers");
var adminRoleApplicationRouter = require("./routes/adminRoleApplications");
var adminHorseRouter = require("./routes/adminHorses");
var adminRegistrationCancellationTicketRouter = require("./routes/adminRegistrationCancellationTickets");
var horseOwnerRouter = require("./routes/horseOwner");
var racetrackRouter = require("./routes/racetracks");
var tournamentRouter = require("./routes/tournaments");
var roundRouter = require("./routes/rounds");
var raceRouter = require("./routes/races");
var registrationRouter = require("./routes/registrations");
var jockeyAssignmentRouter = require("./routes/jockeyAssignments");
var raceResultRouter = require("./routes/raceResults");
var prizeRouter = require("./routes/prizes");
var betRouter = require("./routes/bets");
var violationRouter = require("./routes/violations");
var refereeRouter = require("./routes/referees");
var jockeyRouter = require("./routes/jockeys");
var horseCheckRouter = require("./routes/horseChecks");
var refereeReportRouter = require("./routes/refereeReports");
var roleApplicationRouter = require("./routes/roleApplications");
var internalRaceRouter = require("./routes/internalRaces");
// ── Wallet & Payment ────────────────────────────────────────────────────────
var walletRouter = require("./routes/wallet");
var rewardRouter = require("./routes/rewards");
var depositRouter = require("./routes/deposit");
var adminDepositRouter = require("./routes/adminDeposit");
var adminDashboardRouter = require("./routes/adminDashboard");
var adminRewardsRouter = require("./routes/adminRewards");
var errorHandler = require("./middlewares/errorHandler");

var app = express();

// Disable ETag-based caching so client always receives the latest populated
// response after backend changes (e.g. when adding new Sequelize includes).
app.set("etag", false);
app.disable("x-powered-by");

var configuredCorsOrigins = (process.env.CORS_ALLOWED_ORIGINS || "")
  .split(",")
  .map(function (origin) {
    return origin.trim();
  })
  .filter(Boolean);

function isAllowedCorsOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (configuredCorsOrigins.includes(origin)) {
    return true;
  }

  return process.env.NODE_ENV !== "production"
    && /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

app.use(function corsMiddleware(req, res, next) {
  var origin = req.headers.origin;

  if (origin && !isAllowedCorsOrigin(origin)) {
    if (req.method === "OPTIONS") {
      return res.status(403).json({
        success: false,
        message: "Origin is not allowed"
      });
    }

    return next();
  }

  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
  }

  res.setHeader(
    "Access-Control-Allow-Headers",
    "Authorization, Content-Type, Accept, X-Requested-With"
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.setHeader("Access-Control-Max-Age", "86400");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  return next();
});

// view engine setup
app.set("views", path.join(__dirname, "views"));
app.set("view engine", "pug");

app.use(logger("dev"));
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));

app.use("/", indexRouter);
app.use("/users", usersRouter);
app.use("/api/auth", authRouter);
app.use("/api/admin", adminUserRouter);
app.use("/api/admin", adminDashboardRouter);
app.use("/api/admin", adminRewardsRouter);
app.use("/api/admin", adminRoleApplicationRouter);
app.use("/api/admin", adminHorseRouter);
app.use("/api/admin", adminRegistrationCancellationTicketRouter);
app.use("/api/role-applications", roleApplicationRouter);
app.use("/api/racetracks", racetrackRouter);
app.use("/api/tournaments", tournamentRouter);
app.use("/api/rounds", roundRouter);
app.use("/api/races", raceRouter);
app.use("/api/registrations", registrationRouter);
app.use("/api/jockey-assignments", jockeyAssignmentRouter);
app.use("/api/race-results", raceResultRouter);
app.use("/api/prizes", prizeRouter);
app.use("/api/bets", betRouter);
app.use("/api/violations", violationRouter);
app.use("/api/referees", refereeRouter);
app.use("/api/jockeys", jockeyRouter);
app.use("/api/horse-owner", horseOwnerRouter);
app.use("/api/horse-checks", horseCheckRouter);
app.use("/api/referee-reports", refereeReportRouter);
app.use("/api/internal", internalRaceRouter);
// ── Wallet & Payment ────────────────────────────────────────────────────────
app.use("/api/wallet", walletRouter);
app.use("/api/rewards", rewardRouter);
app.use("/api/deposit", depositRouter);
app.use("/api/admin", adminDepositRouter);

////////
const net = require("net");

app.get("/test-smtp", (req, res) => {
  const socket = net.createConnection({
    host: "smtp.gmail.com",
    port: 587
  });

  socket.on("connect", () => {
    socket.end();

    res.json({
      success: true,
      message: "Can connect SMTP port 587"
    });
  });

  socket.on("error", (err) => {
    res.json({
      success: false,
      code: err.code,
      message: err.message,
      error: String(err)
    });
  });

  socket.setTimeout(10000, () => {
    socket.destroy();

    res.json({
      success: false,
      code: "TIMEOUT",
      message: "Connection timeout"
    });
  });
});
////////

// catch 404 and forward to error handler
app.use(function (req, res, next) {
  next(createError(404));
});

app.use(errorHandler);

// error handler
app.use(function (err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get("env") === "development" ? err : {};

  // render the error page
  res.status(err.status || 500);
  res.render("error");
});

module.exports = app;
