import { useEffect, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  CircleDollarSign,
  Clock3,
  Coins,
  Flag,
  Lock,
  MapPin,
  Shield,
  Trophy,
  Unlock,
  Users,
  UsersRound,
} from "lucide-react";
import LoadingSkeleton from "../../components/LoadingSkeleton.jsx";
import { useSpectatorTournamentDetail, useSpectatorRaceResultsSingle } from "./useSpectatorData.js";
import { getHorseJockeyImage } from "./spectatorAdapters.js";
import { mockContenders } from "./live-race/mockRaceFixtures.js";
import RaceViewer2D from "./live-race/RaceViewer2D.jsx";
import { useRaceViewerSession } from "./live-race/useRaceViewerSession.js";
import { spectatorApi } from "../../api/spectatorApi.js";
import {
  BETTING_STATUS,
  RACE_STATUS,
  bettingStatusMeta,
  raceStatusMeta,
} from "./race/raceStatus.js";
import "./spectator.css";

const RUNNER_COLORS = ["#f0a15c", "#9dd5b1", "#eee7d4", "#d96a61", "#78b9ef", "#e6b080", "#b1ebd6", "#80c4e6"];
const LIVE_STATE_REFRESH_MS = 3000;

function StatusPill({ meta }) {
  if (!meta) return null;
  return (
    <span className={`race-hub-status race-hub-status--${meta.tone}`}>{meta.label}</span>
  );
}

function FactCard({ icon: Icon, label, value, accent }) {
  return (
    <div className={`rd-fact${accent ? " rd-fact--accent" : ""}`}>
      <span className="rd-fact__label">
        <Icon size={14} />
        {label}
      </span>
      <strong className="rd-fact__value">{value}</strong>
    </div>
  );
}

function ParticipantPreview({ contenders, isOfficial, isLiveConnection }) {
  const isReal = isOfficial || isLiveConnection;
  return (
    <section className="race-detail-field" aria-label={isReal ? "Race participants" : "Prototype race participants"}>
      <div className="live-race-section-heading">
        <div>
          <span className="live-race-kicker">
            <UsersRound size={14} /> {isReal ? "Field" : "Prototype field"}
          </span>
          <h2>{isReal ? "Runners and riders" : "Sample runners and riders"}</h2>
        </div>
        <small>{contenders.length} fixtures</small>
      </div>
      <div className="race-detail-field__list">
        {contenders.map((horse) => (
          <article className="race-detail-field__row" key={horse.id}>
            <span className="race-detail-field__lane">{horse.lane}</span>
            <img src={horse.image} alt="" />
            <div className="race-detail-field__identity">
              <strong>{horse.horse}</strong>
              <small>
                {horse.jockey} {horse.owner && `/ ${horse.owner}`}
              </small>
            </div>
            <div className="race-detail-field__form">
              <span>{horse.weight}</span>
              {!isReal && <small>Form {horse.form}</small>}
            </div>
            <span className="race-detail-field__approved">
              <CheckCircle2 size={14} /> {isReal ? "Official" : "Preview"}
            </span>
          </article>
        ))}
      </div>
    </section>
  );
}

function getId(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  const id = value._id || value.id;
  return id ? String(id) : "";
}

function getJockeyName(jockey) {
  if (!jockey || typeof jockey === "string") return "Unknown Jockey";
  return jockey.user_id?.full_name || jockey.full_name || jockey.name || "Unknown Jockey";
}

function getLiveStateSignature(liveState) {
  if (!liveState) return "";

  return JSON.stringify({
    raceStatus: liveState.race?.status,
    participants: (liveState.participants || []).map((participant) => [
      getId(participant.horse_id || participant.horse),
      participant.eligible,
      participant.pre_race_check?.status,
    ]),
    engineId: getId(liveState.engine),
    engineStatus: liveState.engine?.status,
    finishOrder: (liveState.engine?.finish_order || []).map((result) => [
      getId(result.horse_id || result.horse),
      result.position,
      result.finish_time,
    ]),
  });
}

function mapRaceEngineContenders(engine) {
  if (!engine?.finish_order?.length) return [];

  const participantsByHorse = new Map(
    (engine.participants || []).map((participant) => [
      getId(participant.horse_id || participant.horse),
      participant,
    ]),
  );

  return [...engine.finish_order]
    .sort((left, right) => Number(left.position) - Number(right.position))
    .map((order, index) => {
      const horseId = getId(order.horse_id || order.horse);
      const participant = participantsByHorse.get(horseId) || {};
      const horse = participant.horse || order.horse || participant.horse_id || order.horse_id || {};
      const jockey = participant.jockey || order.jockey || participant.jockey_id || order.jockey_id || {};
      const position = Number(order.position);
      const finishTime = Number(order?.finish_time);

      if (!horseId || !Number.isInteger(position) || position < 1) {
        return null;
      }

      return {
        id: horseId,
        horse: horse?.name || "Unknown horse",
        jockey: getJockeyName(jockey),
        owner: horse?.owner_id?.stable_name || "Horse Owner",
        lane: participant.draw != null ? Number(participant.draw) : participant.lane != null ? Number(participant.lane) : index + 1,
        weight: horse?.weight ? `${horse.weight}kg` : "56kg",
        form: "Race Engine",
        image: getHorseJockeyImage(horseId),
        color: RUNNER_COLORS[index % RUNNER_COLORS.length],
        position,
        raceEngineFinishTimeMs: Number.isFinite(finishTime) ? Math.round(finishTime * 1000) : undefined,
      };
    })
    .filter(Boolean);
}

function mapLiveParticipantContenders(participants = []) {
  return participants
    .filter((participant) => !participant.pre_race_check || participant.eligible)
    .map((participant, index) => {
    const horse = participant.horse || participant.horse_id || {};
    const jockey = participant.jockey || participant.jockey_id || {};
    const horseId = getId(participant.horse_id || horse);

    return {
      id: horseId,
      horse: horse?.name || "Unknown horse",
      jockey: participant.jockey_name || getJockeyName(jockey),
      owner: participant.owner_name || participant.owner?.stable_name || "Horse Owner",
      lane: participant.lane != null ? Number(participant.lane) : index + 1,
      weight: horse?.weight ? `${horse.weight}kg` : "56kg",
      form: participant.eligible ? "Eligible" : "Pending check",
      image: getHorseJockeyImage(horseId),
      color: RUNNER_COLORS[index % RUNNER_COLORS.length],
      position: index + 1,
    };
  });
}

export default function RaceDetail() {
  const { raceId, tournamentId } = useParams();
  const { isLoading: isLoadingTournament, races, tournament } = useSpectatorTournamentDetail(tournamentId);
  const { results: realResults, isLoading: isLoadingResults } = useSpectatorRaceResultsSingle(raceId);
  const race = races.find((item) => String(item.id) === String(raceId));

  const [raceLiveState, setRaceLiveState] = useState(null);

  const hasRealResults = realResults && realResults.length > 0;

  useEffect(() => {
    if (!raceId || hasRealResults) return;

    let active = true;
    async function fetchLiveState() {
      try {
        const data = await spectatorApi.getRaceLiveState(raceId);
        if (active) {
          setRaceLiveState((current) => (
            getLiveStateSignature(current) === getLiveStateSignature(data)
              ? current
              : data || null
          ));
        }
      } catch (err) {
        console.warn("Could not fetch real participants from backend (spectator access may be restricted):", err.message);
      }
    }

    fetchLiveState();
    const interval = window.setInterval(() => {
      fetchLiveState();
    }, LIVE_STATE_REFRESH_MS);

    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, [raceId, hasRealResults]);

  const realContenders = hasRealResults
    ? realResults.map((r, idx) => ({
        id: r.horseId,
        horse: r.horse,
        jockey: r.jockey,
        owner: "Horse Owner",
        lane: r.lane !== "-" && r.lane != null ? Number(r.lane) : idx + 1,
        weight: r.weight ? `${r.weight}kg` : "56kg",
        form: "-",
        image: getHorseJockeyImage(r.horseId),
        color: ["#f0a15c", "#9dd5b1", "#eee7d4", "#d96a61", "#78b9ef", "#e6b080", "#b1ebd6", "#80c4e6"][idx % 8],
        position: Number(r.position),
      }))
    : [];
  const raceEngineContenders = mapRaceEngineContenders(raceLiveState?.engine);
  const liveParticipantContenders = mapLiveParticipantContenders(raceLiveState?.participants || []);
  const hasRaceEngineOrder = !hasRealResults && raceEngineContenders.length > 0;
  const hasBackendParticipants = !hasRealResults && liveParticipantContenders.length > 0;
  const effectiveRace = race
    ? {
        ...race,
        raceStatus: raceLiveState?.race?.status || race.raceStatus,
        updatedAt: raceLiveState?.race?.updated_at || race.updatedAt,
        engineGeneratedAt: raceLiveState?.engine?.generated_at || null,
      }
    : race;

  let contenders = [];
  if (hasRealResults) {
    contenders = [...realContenders];
  } else if (hasRaceEngineOrder) {
    contenders = [...raceEngineContenders];
  } else if (hasBackendParticipants) {
    contenders = [...liveParticipantContenders];
  } else {
    const usedLanes = new Set();
    const usedIds = new Set();
    let nextLane = 1;
    for (const mock of mockContenders) {
      if (contenders.length >= 8) break;
      if (usedIds.has(mock.id)) continue;
      while (usedLanes.has(nextLane)) {
        nextLane++;
      }
      contenders.push({
        ...mock,
        lane: nextLane,
        position: contenders.length + 1,
      });
      usedLanes.add(nextLane);
      usedIds.add(mock.id);
    }
  }

  contenders.sort((a, b) => a.lane - b.lane);

  const viewer = useRaceViewerSession(effectiveRace, contenders, { useRaceEngineOrder: hasRaceEngineOrder });

  const isLoading = isLoadingTournament || isLoadingResults;

  if (isLoading) {
    return (
      <section className="spectator-page">
        <LoadingSkeleton ariaLabel="Loading race overview" variant="detail" />
      </section>
    );
  }

  if (!tournament || !race)
    return <Navigate to={`/spectator/tournaments/${tournamentId}`} replace />;

  const raceMeta = raceStatusMeta[effectiveRace.raceStatus];
  const marketMeta =
    race.bettingStatus === BETTING_STATUS.UNAVAILABLE
      ? null
      : bettingStatusMeta[race.bettingStatus];

  const canBet = race.bettingStatus === BETTING_STATUS.OPEN;
  const isScheduled = effectiveRace.raceStatus === RACE_STATUS.SCHEDULED;

  const raceResult = hasRealResults
    ? {
        race_id: raceId,
        finished_at: realResults[0]?.publishedAt || new Date().toISOString(),
        results: realResults.map((r) => ({
          horse_id: r.horseId,
          position: Number(r.position),
          finish_time_ms: Number(r.time) * 1000,
        })),
        sequence: 301,
      }
    : viewer.raceResult;

  const isResultPending = effectiveRace.raceStatus === RACE_STATUS.COMPLETED && !hasRealResults;
  const viewerEyebrow = hasRealResults ? "Official 2D track" : hasRaceEngineOrder ? "Race Engine 2D track" : hasBackendParticipants ? "Backend field preview" : isResultPending ? "Result pending" : "Prototype 2D track";
  const rankingEyebrow = hasRealResults ? "Official ranking" : hasRaceEngineOrder ? "Race Engine order" : hasBackendParticipants ? "Backend field" : isResultPending ? "Race Engine" : "Sample order";
  const rankingTitle = hasRealResults ? "Final standings" : isResultPending && !hasRaceEngineOrder ? "Awaiting official standings" : hasRaceEngineOrder ? "Engine-driven running order" : hasBackendParticipants ? "Registered runners" : "Fixture positions";
  const statusLabel = hasRealResults ? "Official" : hasRaceEngineOrder ? "Engine order connected" : hasBackendParticipants ? "Participants connected" : isResultPending ? "Awaiting official result" : "Simulation only";

  const coreFactItems = [
    race.raceDateDisplay
      ? { icon: CalendarDays, label: "Race date", value: race.raceDateDisplay }
      : null,
    race.time ? { icon: Clock3, label: "Start time", value: race.time } : null,
    race.distance ? { icon: Flag, label: "Distance", value: race.distance } : null,
    race.location || tournament.location
      ? { icon: MapPin, label: "Venue", value: race.location || tournament.location }
      : null,
    race.maxParticipants != null
      ? {
          icon: Users,
          label: "Runners",
          value:
            race.runnerCount != null
              ? `${race.runnerCount} / ${race.maxParticipants}`
              : `Max ${race.maxParticipants}`,
        }
      : null,
    race.prize
      ? { icon: Trophy, label: "Race prize", value: race.prize }
      : null,
  ].filter(Boolean);

  return (
    <section className="spectator-page rd-page">
      {/* Back link */}
      <Link
        className="tournament-detail-back"
        to={`/spectator/tournaments/${tournamentId}`}
      >
        <ArrowLeft size={16} /> Back to race schedule
      </Link>

      {/* ── Hero ── */}
      <header className="rd-hero">
        <div className="rd-hero__image-wrap">
          <img src={race.image} alt={race.name} />
          <div className="rd-hero__image-overlay" />
        </div>
        <div className="rd-hero__content">
          <p className="spectator-eyebrow">
            {tournament.name}
            {race.roundName ? ` / ${race.roundName}` : ""}
          </p>
          <h1 className="rd-hero__title">{race.name}</h1>
          <div className="rd-hero__status-row">
            <StatusPill meta={raceMeta} />
            <StatusPill meta={marketMeta} />
          </div>
          {canBet && (
            <Link
              className="race-hub-action race-hub-action--primary rd-hero__bet-cta"
              to={`/spectator/predictions/races/${encodeURIComponent(race.id)}`}
            >
              Predict this race <CircleDollarSign size={16} />
            </Link>
          )}
        </div>
      </header>

      {/* ── Core Facts ── */}
      {coreFactItems.length > 0 && (
        <section className="rd-facts-panel" aria-label="Race details">
          <h2 className="rd-panel-title">
            <Flag size={15} /> Race details
          </h2>
          <div className="rd-facts-grid">
            {coreFactItems.map(({ icon, label, value }) => (
              <FactCard key={label} icon={icon} label={label} value={value} />
            ))}
          </div>
        </section>
      )}

      {/* Prediction Market Panel */}
      {race.bettingMarket && race.bettingStatus !== BETTING_STATUS.UNAVAILABLE && (
        <section className="rd-market-panel" aria-label="Prediction market">
          <h2 className="rd-panel-title">
            <Coins size={15} /> Prediction market
          </h2>
          <div className="rd-market-grid">
            <div className="rd-market-card rd-market-card--status">
              <span>Market status</span>
              <StatusPill meta={marketMeta} />
            </div>
            {race.bettingMarket.minStake != null && (
              <div className="rd-market-card">
                <span>Min stake</span>
                <strong>
                  {race.bettingMarket.minStake} {race.bettingMarket.currency}
                </strong>
              </div>
            )}
            {race.bettingMarket.maxStake != null && (
              <div className="rd-market-card">
                <span>Max stake</span>
                <strong>
                  {race.bettingMarket.maxStake} {race.bettingMarket.currency}
                </strong>
              </div>
            )}
            {race.bettingMarket.closesAtDisplay && (
              <div className="rd-market-card">
                <span>Closes</span>
                <strong>
                  {race.bettingMarket.closesAtDisplay}
                  {race.bettingMarket.closesAtTimeDisplay
                    ? ` / ${race.bettingMarket.closesAtTimeDisplay}`
                    : ""}
                </strong>
              </div>
            )}
          </div>

          {canBet && (
            <Link
              className="race-hub-action race-hub-action--primary rd-market-cta"
              to={`/spectator/predictions/races/${encodeURIComponent(race.id)}`}
            >
              Make prediction <CircleDollarSign size={16} />
            </Link>
          )}
        </section>
      )}

      {/* ── Referee & Registration ── */}
      <section className="rd-meta-row" aria-label="Race administration">
        {race.refereeName && (
          <div className="rd-meta-card">
            <span className="rd-meta-card__label">
              <Shield size={13} /> Race referee
            </span>
            <strong className="rd-meta-card__value">{race.refereeName}</strong>
            {race.refereeExperience != null && (
              <span className="rd-meta-card__sub">{race.refereeExperience} yrs experience</span>
            )}
          </div>
        )}
        <div className="rd-meta-card">
          <span className="rd-meta-card__label">
            {race.registrationLocked ? <Lock size={13} /> : <Unlock size={13} />}
            Registration
          </span>
          <strong className="rd-meta-card__value">
            {race.registrationLocked ? "Locked" : "Open"}
          </strong>
          <span className="rd-meta-card__sub">
            {race.registrationLocked
              ? "No further entries accepted"
              : "Entries still being accepted"}
          </span>
        </div>
      </section>

      <div className="race-detail-viewer-shell">
        <RaceViewer2D
          connectionState={viewer.connectionState}
          contenders={contenders}
          eyebrow={viewerEyebrow}
          race={effectiveRace}
          raceResult={raceResult}
          raceScript={viewer.raceScript}
          rankingEyebrow={rankingEyebrow}
          rankingStateLabel={isScheduled ? "Confirmed" : (hasRealResults ? "Official" : undefined)}
          rankingTitle={rankingTitle}
          statusLabel={statusLabel}
        >
          <ParticipantPreview contenders={contenders} isOfficial={hasRealResults} isLiveConnection={hasRaceEngineOrder || hasBackendParticipants} />
        </RaceViewer2D>
      </div>

    </section>
  );
}
