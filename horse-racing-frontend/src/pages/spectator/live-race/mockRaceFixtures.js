import horseAmber from "../../../assets/pixel-horses/horse-amber.png";
import horseBlue from "../../../assets/pixel-horses/horse-blue.png";
import horseIvory from "../../../assets/pixel-horses/horse-ivory.png";
import horseMint from "../../../assets/pixel-horses/horse-mint.png";
import horseRed from "../../../assets/pixel-horses/horse-red.png";

export const mockRaces = [
  { id: "opening-sprint", name: "Opening Sprint", time: "14:00", distance: "1,200m", status: "Prediction Open", closesIn: "00:30", pool: "8,420 pts" },
  { id: "derby-trial", name: "Derby Trial", time: "15:30", distance: "1,600m", status: "Closing Soon", closesIn: "00:30", pool: "11,260 pts" },
  { id: "championship-final", name: "Championship Final", time: "17:00", distance: "2,000m", status: "Scheduled", closesIn: "00:30", pool: "5,940 pts" },
];

export const mockContenders = [
  { id: "thunderbolt", horse: "Thunderbolt", jockey: "Alex Rider", owner: "Minh Le", lane: 1, weight: "56kg", form: "1-2-1", probability: 64, odds: { win: 2.1, place: 1.42 }, image: horseAmber, color: "#f0a15c" },
  { id: "silver-flash", horse: "Silver Flash", jockey: "Chris Evans", owner: "Aisha Moreno", lane: 2, weight: "55kg", form: "2-1-3", probability: 53, odds: { win: 2.8, place: 1.7 }, image: horseMint, color: "#9dd5b1" },
  { id: "golden-gallop", horse: "Golden Gallop", jockey: "Elena Gilbert", owner: "Tuan Pham", lane: 3, weight: "57kg", form: "3-1-2", probability: 46, odds: { win: 3.4, place: 1.95 }, image: horseIvory, color: "#eee7d4" },
  { id: "midnight-run", horse: "Midnight Run", jockey: "David Miller", owner: "Nora Bennett", lane: 4, weight: "54kg", form: "4-2-2", probability: 38, odds: { win: 4.2, place: 2.25 }, image: horseRed, color: "#d96a61" },
  { id: "crimson-comet", horse: "Crimson Comet", jockey: "Maya Chen", owner: "Rachel Nguyen", lane: 5, weight: "55kg", form: "5-3-1", probability: 29, odds: { win: 5.6, place: 2.9 }, image: horseBlue, color: "#78b9ef" },
  { id: "blazing-speed", horse: "Blazing Speed", jockey: "Jack Carter", owner: "Tran Nguyen", lane: 6, weight: "56kg", form: "2-3-4", probability: 25, odds: { win: 6.8, place: 3.2 }, image: horseAmber, color: "#e6b080" },
  { id: "emerald-shadow", horse: "Emerald Shadow", jockey: "Sofia Rossi", owner: "Gomez Fam", lane: 7, weight: "54kg", form: "3-4-2", probability: 22, odds: { win: 7.5, place: 3.6 }, image: horseMint, color: "#b1ebd6" },
  { id: "sapphire-wind", horse: "Sapphire Wind", jockey: "Ken Tanaka", owner: "Takahashi", lane: 8, weight: "57kg", form: "1-4-5", probability: 18, odds: { win: 9.0, place: 4.2 }, image: horseBlue, color: "#80c4e6" },
];

export const mockWallet = Object.freeze({ balance: 1280, currency: "points" });

export const mockActivePredictions = [
  { race: "Opening Sprint", type: "Win", pick: "Thunderbolt", stake: 200, odds: "2.10x", status: "Pending" },
  { race: "Derby Trial", type: "Place", pick: "Silver Flash", stake: 120, odds: "1.70x", status: "Locked" },
  { race: "Worcester Chase", type: "Exacta", pick: "Thunderbolt / Golden Gallop", stake: 80, odds: "7.14x", status: "Pending" },
];

const sortedMockFinishTimes = [56000, 59000, 60000, 61500, 63000, 64000, 65000, 67000];

const sortedCheckpointDistances = [
  [0, 110, 380, 780, 1000], // 1st: Slow start, dramatic surge at the end
  [0, 95, 410, 750, 1000],  // 2nd: Slower start, huge middle surge
  [0, 165, 430, 720, 1000], // 3rd: Early leader, fades at the end
  [0, 130, 370, 690, 1000], // 4th: Stable mid-pack
  [0, 155, 390, 660, 1000], // 5th: Fast start, then falls behind
  [0, 115, 420, 640, 1000], // 6th: Sprint in the middle, then tires out
  [0, 105, 340, 620, 1000], // 7th: Slow pace throughout
  [0, 160, 350, 600, 1000], // 8th: Fast start, then completely runs out of gas
];

function seededRandom(seedStr) {
  let hash = 0;
  for (let i = 0; i < seedStr.length; i += 1) {
    hash = (hash * 31 + seedStr.charCodeAt(i)) >>> 0;
  }

  return function nextRandom() {
    hash = (hash * 1664525 + 1013904223) >>> 0;
    return hash / 0xffffffff;
  };
}

function clampDistance(value, min, max) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function getChaoticCheckpoints(raceId, horse, horseIndex) {
  const random = seededRandom(`${raceId}:${horse.id}:${horse.position}:${horseIndex}`);
  const burst = random() > 0.5 ? 1 : -1;
  const wobble = random() > 0.5 ? 1 : -1;
  const first = clampDistance(70 + random() * 175 + burst * 35, 45, 285);
  const second = clampDistance(first + 105 + random() * 230 + wobble * 45, first + 70, 585);
  const thirdChaos = 515 + random() * 305 - (Number(horse.position || horseIndex + 1) * 8);
  const third = clampDistance(thirdChaos, second + 60, 820);

  return [0, first, second, third];
}

export function createRaceEngineOrderScript(raceId, startsAt = Date.now() + 3000, contenders = mockContenders) {
  const durationMs = 68000;
  const checkpointTimes = [0, 15000, 30000, 45000];
  const ordered = [...contenders].sort((left, right) => (left.position || 99) - (right.position || 99));
  const baseFinishMs = 56000;
  const finishTimeByHorse = new Map(ordered.map((horse, index) => [
    horse.id,
    horse.raceEngineFinishTimeMs || baseFinishMs + index * 1700,
  ]));

  return {
    race_id: raceId,
    script_version: 1,
    issued_at: new Date().toISOString(),
    starts_at: new Date(startsAt).toISOString(),
    duration_ms: durationMs,
    track_length: 1000,
    horses: contenders.map((horse, horseIndex) => {
      const earlyDistances = getChaoticCheckpoints(raceId, horse, horseIndex);

      return {
        horse_id: horse.id,
        name: horse.horse,
        lane: horse.lane || (horseIndex + 1),
        color: horse.color,
        checkpoints: [...checkpointTimes, finishTimeByHorse.get(horse.id)].map((time, checkpointIndex) => ({
          time_ms: time,
          distance: checkpointIndex < earlyDistances.length ? earlyDistances[checkpointIndex] : 1000,
        })),
      };
    }),
    sequence: 300,
    source: "race_engine_order",
  };
}

export function createMockRaceScript(raceId, startsAt = Date.now() + 3000, contenders = mockContenders) {
  const durationMs = 68000;
  const checkpointTimes = [0, 15000, 30000, 45000];
  const defaultPositions = [4, 6, 1, 8, 2, 5, 3, 7];

  return {
    race_id: raceId,
    script_version: 1,
    issued_at: new Date().toISOString(),
    starts_at: new Date(startsAt).toISOString(),
    duration_ms: durationMs,
    track_length: 1000,
    horses: contenders.map((horse, horseIndex) => {
      const pos = horse.position || defaultPositions[horseIndex] || (horseIndex + 1);
      const posIndex = Math.max(0, Math.min(7, pos - 1));
      return {
        horse_id: horse.id,
        name: horse.horse,
        lane: horse.lane || (horseIndex + 1),
        color: horse.color,
        checkpoints: [...checkpointTimes, sortedMockFinishTimes[posIndex]].map((time, checkpointIndex) => ({
          time_ms: time,
          distance: sortedCheckpointDistances[posIndex][checkpointIndex],
        })),
      };
    }),
    sequence: 300,
  };
}

export function createMockRaceResult(raceId, contenders = mockContenders) {
  const sorted = [...contenders].sort((a, b) => (a.position || 1) - (b.position || 1));
  const baseTimes = [56000, 59000, 60000, 61500, 63000, 64000, 65000, 67000];

  return {
    race_id: raceId,
    finished_at: new Date().toISOString(),
    results: sorted.map((horse, idx) => ({
      horse_id: horse.id,
      position: idx + 1,
      finish_time_ms: baseTimes[idx % baseTimes.length] || (56000 + idx * 2000),
    })),
    sequence: 301,
  };
}
