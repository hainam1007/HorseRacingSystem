import { normalizeBettingMarketStatus, normalizeRaceLifecycle } from "./race/raceStatus";
import horseAmber from "../../assets/pixel-horses/horse-amber.png";
import horseBlue from "../../assets/pixel-horses/horse-blue.png";
import horseIvory from "../../assets/pixel-horses/horse-ivory.png";
import horseMint from "../../assets/pixel-horses/horse-mint.png";
import horseRed from "../../assets/pixel-horses/horse-red.png";

// ─── Image pools (from asset docs) ────────────────────────────────────────────
const TRACK_IMAGES = [
  "https://i.pinimg.com/736x/4d/e7/2f/4de72f60ea3018aafe760f0148a29af6.jpg",
  "https://i.pinimg.com/1200x/3d/ff/a1/3dffa140ed55cb85b21a9e021e4cb2c8.jpg",
  "https://i.pinimg.com/736x/56/b4/2f/56b42f543b435926b04654e794d620f2.jpg",
  "https://i.pinimg.com/1200x/ae/08/50/ae0850e67c950abd7e962008bc7ae3fb.jpg",
];

const TOURNAMENT_IMAGES = [
  "https://upload.wikimedia.org/wikipedia/commons/4/48/GGF_Race5.jpg",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT1eBBm_P-QFmlqGsCPSzMhVvCLgox9RdzPLcjWYd5s7gjrsZDEmAo0r9Y&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRsBhvh6eZD9Po6EQggn33GSJ2HDxBbPfBsn0U8voOVqnilVhRjAeD2vL8&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHIR1YaAw1iN9gOWTeEpJRIdyM2ZU2hyfGltYpQsOKBA&s",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQos0Yf2hCLEj8Zdvan6F_oqxJ7fgoFBz6pv83cDcDeO2VgF7uR5KnwDcY&s=10",
  "https://i.ytimg.com/vi/DcKduq72F3s/maxresdefault.jpg",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT_pohoZ7249yBzQjLVn3tdU1AJc_EyWl8S1sNGh4aNKEvFmHSvvCzTW-UH&s=10",
  "https://static.vecteezy.com/system/resources/thumbnails/056/330/676/small_2x/cartoon-hippodrome-competition-horse-race-track-with-jockey-riding-horses-equestrian-sport-and-horse-riders-compete-fast-galloping-tournament-illustration-vector.jpg",
  "https://static.vecteezy.com/system/resources/previews/043/336/525/non_2x/horse-racing-competition-illustration-with-equestrian-performance-sport-and-rider-or-jockeys-in-a-racecourse-on-flat-cartoon-background-vector.jpg",
  "https://tscom.imgix.net/Keeneland_Scenics_Keeneland_3_27482bc9c0.jpg?auto=compress,format",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT6AtOlQwndBjMfZiuXr4F1E9nQbgYr9wvhAtoCvhCH4fexRSi1vS-27D0&s=10",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQBxdTiAyxKOJ1qDBVXSyJ3QAz_FqmeZ_o2UDxJlPxtOYUlMjjC6RCX5R34&s=10",
  "https://tscom.imgix.net/Keeneland_Scenics_Keeneland_3_27482bc9c0.jpg?auto=compress,format",
  "https://thumbs.dreamstime.com/b/horse-racing-tournament-flat-style-colorful-vector-illustration-jockeys-sprinting-horses-280854880.jpg",
  "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTqPcsP_eWFAOV6F8--oSDELEwJ3JuQumnrrY_xB6hU8cHXlmxN3EBBNoL4&s=10",
];

const BROKEN_TOURNAMENT_IMAGES = new Set([
  "https://i.pinimg.com/736x/77/67/b3/7767b3aff6520a4c2f8b298759cd9f98.jpg",
]);
const SAFE_TOURNAMENT_FALLBACK_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/4/48/GGF_Race5.jpg";

const HORSE_JOCKEY_IMAGES = [horseAmber, horseBlue, horseIvory, horseMint, horseRed];

// Deterministic image selection based on id string → stable across renders
function pickImage(pool, id) {
  if (!id) return pool[0];
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return pool[hash % pool.length];
}

export function getTrackImage(id) {
  return pickImage(TRACK_IMAGES, id);
}

export function getTournamentImage(id) {
  return pickImage(TOURNAMENT_IMAGES, id);
}

export function getTournamentFallbackImage() {
  return SAFE_TOURNAMENT_FALLBACK_IMAGE;
}

export function getHorseJockeyImage(id) {
  return pickImage(HORSE_JOCKEY_IMAGES, id);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  return value._id || value.id || "";
}

function formatDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  return date.toISOString().slice(0, 10);
}

function formatDateDisplay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatLocalDateDisplay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-US", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeDisplay(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatPrize(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value === "number") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }
  return String(value);
}

function formatRacePrize(value, currency = "VND") {
  if (value === undefined || value === null || value === "" || Number(value) <= 0) return null;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency || "VND",
    maximumFractionDigits: 0,
  }).format(Number(value));
}

function normalizeTournamentStatus(status) {
  const value = String(status || "").toLowerCase();
  if (["active", "ongoing", "running", "in_progress", "started"].includes(value)) return "Active";
  if (["completed", "finished", "closed", "archived"].includes(value)) return "Completed";
  return "Upcoming";
}

function extractCollection(payload, keys) {
  for (const key of keys) {
    if (Array.isArray(payload?.[key])) return payload[key];
  }
  return [];
}

function pickUniqueTournamentImage(seed, usedImages) {
  const seedIndex = Math.abs(String(seed || "").split("").reduce((total, char) => total + char.charCodeAt(0), 0));

  for (let offset = 0; offset < TOURNAMENT_IMAGES.length; offset += 1) {
    const candidate = TOURNAMENT_IMAGES[(seedIndex + offset) % TOURNAMENT_IMAGES.length];
    if (!usedImages.has(candidate)) return candidate;
  }

  return TOURNAMENT_IMAGES[seedIndex % TOURNAMENT_IMAGES.length];
}

// ─── Tournament adapter ───────────────────────────────────────────────────────
export function toSpectatorTournament(apiTournament) {
  const id = getId(apiTournament);
  const status = normalizeTournamentStatus(apiTournament.status);
  const imageUrl = apiTournament.image_url?.trim();

  return {
    id,
    name: apiTournament.name || "Unnamed tournament",
    description: apiTournament.description || "",
    location: apiTournament.location || null,
    status,
    prize: formatPrize(apiTournament.total_race_prize_pool || 0),
    prizeTotalsByCurrency: apiTournament.prize_totals_by_currency || {},
    date: formatDate(apiTournament.start_date || apiTournament.date),
    dateDisplay: formatDateDisplay(apiTournament.start_date || apiTournament.date),
    endDate: formatDate(apiTournament.end_date),
    endDateDisplay: formatDateDisplay(apiTournament.end_date),
    image: imageUrl && !BROKEN_TOURNAMENT_IMAGES.has(imageUrl) ? imageUrl : getTournamentFallbackImage(),
    distance: apiTournament.distance ? `${apiTournament.distance}m` : null,
    track: apiTournament.track || null,
    entries: apiTournament.entries ?? apiTournament.max_participants ?? null,
  };
}

// ─── Race adapter ─────────────────────────────────────────────────────────────
export function toSpectatorRace(apiRace) {
  const id = getId(apiRace);
  const raceDate = apiRace.race_date || apiRace.date;
  const tournament = apiRace.tournament_id || apiRace.tournament || {};
  const round = apiRace.round_id || apiRace.round || {};
  const date = new Date(raceDate);
  const hasValidDate = !Number.isNaN(date.getTime());

  const marketStatus =
    apiRace.betting_status ||
    apiRace.market_status ||
    apiRace.betting_market?.status ||
    apiRace.market?.status;

  const bettingMarket = apiRace.betting_market
    ? {
        status: normalizeBettingMarketStatus(apiRace.betting_market.status),
        opensAt: apiRace.betting_market.opens_at || null,
        closesAt: apiRace.betting_market.closes_at || null,
        opensAtDisplay: formatDateDisplay(apiRace.betting_market.opens_at),
        closesAtDisplay: formatDateDisplay(apiRace.betting_market.closes_at),
        closesAtTimeDisplay: formatTimeDisplay(apiRace.betting_market.closes_at),
        minStake: apiRace.betting_market.min_stake ?? null,
        maxStake: apiRace.betting_market.max_stake ?? null,
        currency: apiRace.betting_market.currency || "points",
      }
    : null;

  // Referee info
  const refereeProfile = apiRace.referee_id;
  const refereeUser = refereeProfile?.user_id;
  const refereeName = refereeUser?.full_name || null;
  const refereeExperience = refereeProfile?.experience_years ?? null;

  return {
    id,
    tournamentId: getId(tournament),
    tournamentName: tournament.name || null,
    tournamentLocation: tournament.location || null,
    roundId: getId(round),
    roundName: round.name || apiRace.round_name || null,
    roundOrder: round.round_order ?? null,
    raceDate: hasValidDate ? date.toISOString() : null,
    raceDateDisplay: hasValidDate ? formatLocalDateDisplay(raceDate) : null,
    time: hasValidDate
      ? date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
      : null,
    name: apiRace.name || "Unnamed race",
    distance: apiRace.distance ? `${apiRace.distance}m` : null,
    location: apiRace.location || tournament.location || null,
    runnerCount: apiRace.runner_count ?? apiRace.participant_count ?? apiRace.entries ?? null,
    maxParticipants: apiRace.max_participants ?? null,
    registrationLocked: apiRace.registration_locked ?? false,
    rawRaceStatus: apiRace.status || "",
    raceStatus: normalizeRaceLifecycle(apiRace.status),
    bettingStatus: normalizeBettingMarketStatus(marketStatus),
    bettingClosesAt: apiRace.betting_closes_at || apiRace.betting_market?.closes_at || null,
    bettingClosesAtDisplay: formatDateDisplay(apiRace.betting_closes_at || apiRace.betting_market?.closes_at),
    bettingMarket,
    prizePool: apiRace.prize_pool ?? 0,
    prizeCurrency: apiRace.prize_currency || "VND",
    prize: formatRacePrize(apiRace.prize_pool, apiRace.prize_currency || "VND"),
    prizeDistribution: apiRace.prize_distribution || [],
    resultStatus: apiRace.result_status || null,
    refereeName,
    refereeExperience,
    image: getHorseJockeyImage(id),
    updatedAt: apiRace.updated_at || apiRace.updatedAt || null,
  };
}

// ─── List adapters ────────────────────────────────────────────────────────────
export function adaptTournamentList(payload) {
  const rows = extractCollection(payload, ["tournaments", "data"]);
  const usedImages = new Set();

  return {
    tournaments: rows.map((row, index) => {
      const tournament = toSpectatorTournament(row);

      if (!tournament.image || usedImages.has(tournament.image)) {
        tournament.image = pickUniqueTournamentImage(tournament.id || index, usedImages);
      }

      usedImages.add(tournament.image);
      return tournament;
    }),
  };
}

export function summarizeTournamentRaces(racesPayload) {
  const races = extractCollection(racesPayload, ["races", "data"]).map(toSpectatorRace);
  const sortedRaces = [...races].sort((a, b) => new Date(a.raceDate || 0) - new Date(b.raceDate || 0));
  const nextRace = sortedRaces.find((race) => race.raceDate && new Date(race.raceDate).getTime() >= Date.now()) || sortedRaces[0];
  const distances = [...new Set(races.map((race) => race.distance).filter(Boolean))];
  const locations = [...new Set(races.map((race) => race.location).filter(Boolean))];
  const runnerCapacity = races.reduce((total, race) => total + (Number(race.maxParticipants) || 0), 0);
  const runnerEntries = races.reduce((total, race) => total + (Number(race.runnerCount) || 0), 0);
  const prizeTotalsByCurrency = races.reduce((totals, race) => {
    const currency = race.prizeCurrency || "VND";
    totals[currency] = (totals[currency] || 0) + Number(race.prizePool || 0);
    return totals;
  }, {});

  return {
    raceCount: races.length,
    runnerCapacity: runnerCapacity || null,
    runnerEntries: runnerEntries || null,
    nextRaceDateDisplay: nextRace?.raceDateDisplay || null,
    nextRaceTime: nextRace?.time || null,
    distanceSummary: distances.length > 2 ? `${distances[0]} - ${distances[distances.length - 1]}` : distances.join(" / ") || null,
    trackSummary: locations[0] || null,
    prizeTotalsByCurrency,
  };
}

export function adaptTournamentDetail({ tournamentPayload, racesPayload }) {
  const tournamentRow = tournamentPayload?.tournament || tournamentPayload;
  const races = extractCollection(racesPayload, ["races", "data"]);

  if (!tournamentRow?.name) {
    return {
      tournament: null,
      races: [],
    };
  }

  return {
    tournament: toSpectatorTournament(tournamentRow),
    races: races.map(toSpectatorRace),
  };
}

// ─── Race results adapters ────────────────────────────────────────────────────
export function toSpectatorRaceResult(apiResult, index = 0) {
  const horse = apiResult.horse_id || apiResult.horse || {};
  const jockey = apiResult.jockey_id || apiResult.jockey || {};
  const race = apiResult.race_id || apiResult.race || {};
  const positionValue = apiResult.final_position ?? apiResult.position;
  const numericPosition = Number(positionValue);
  const position = Number.isInteger(numericPosition) && numericPosition > 0
    ? numericPosition
    : null;

  return {
    id: getId(apiResult) || `${getId(race)}-${getId(horse)}-${index}`,
    raceId: getId(race),
    horseId: getId(horse),
    position,
    horse: typeof horse === "string" ? horse : horse.name || apiResult.horse_name || "Unknown Horse",
    jockey:
      typeof jockey === "string"
        ? jockey
        : jockey.user_id?.full_name || jockey.full_name || apiResult.jockey_name || "Unknown Jockey",
    race: typeof race === "string" ? race : race.name || apiResult.race_name || "Race",
    lane: apiResult.lane || "-",
    weight: typeof horse === "object" ? horse.weight : null,
    ownerId: typeof horse === "object" ? getId(horse.owner_id) : "",
    time: (() => {
      const val = apiResult.final_finish_time ?? apiResult.finish_time;
      if (val === null || val === undefined || val === "") return "-";
      const num = Number(val);
      return !Number.isNaN(num) ? num.toFixed(2) : val;
    })(),
    margin: position === 1 ? "Winner" : "-",
    status: apiResult.status === "published" ? "Official" : "Review",
    score: apiResult.final_score ?? apiResult.score ?? "-",
    publishedAt: apiResult.published_at || null,
  };
}

export function adaptRaceResults(payload) {
  const rows = extractCollection(payload, ["results", "race_results", "data"]);
  if (!rows.length) return { results: [] };
  return {
    results: rows.map(toSpectatorRaceResult),
  };
}

export function toHorseLeaderboard(results = []) {
  const byHorse = new Map();

  results.forEach((result) => {
    const key = result.horseId || result.horse;
    const existing = byHorse.get(key) || {
      name: result.horse,
      jockey: result.jockey,
      wins: 0,
      starts: 0,
      totalScore: 0,
    };

    existing.starts += 1;
    existing.wins += Number(result.position) === 1 ? 1 : 0;
    existing.totalScore += Number(result.score) || 0;
    if (!existing.jockey) existing.jockey = result.jockey;
    byHorse.set(key, existing);
  });

  return Array.from(byHorse.values())
    .sort((a, b) => b.wins - a.wins || b.totalScore - a.totalScore || a.name.localeCompare(b.name))
    .map((horse, index) => ({
      rank: index + 1,
      name: horse.name,
      jockey: horse.jockey,
      wins: horse.wins,
      starts: horse.starts,
      totalScore: horse.totalScore,
      winRate: `${Math.round((horse.wins / Math.max(horse.starts, 1)) * 100)}%`,
      image: getTrackImage(horse.name),
    }));
}
