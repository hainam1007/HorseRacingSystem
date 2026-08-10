import { Activity, Clock3, Flag, Medal, ShieldCheck, Sparkles, Trophy } from "lucide-react";
import { formatRaceTime } from "./raceMath";
import { useRacePlayback } from "./useRacePlayback";

const stateLabels = {
  waiting: "Waiting for race script",
  ready: "Runners at the gate",
  racing: "Race in progress",
  "awaiting-result": "Awaiting official result",
  reconnecting: "Playback paused",
  finished: "Official finish",
  error: "Script unavailable",
};

const stadiumCrowd = Array.from({ length: 96 }, (_, index) => ({
  id: index,
  position: (Math.floor(index / 3) / 32) * 100,
  row: index % 3,
}));

function StadiumEnvironment() {
  return (
    <div className="live-race-stadium" aria-hidden="true">
      <div className="live-race-stadium__bowl" />
      <div className="live-race-stadium__canopy" />
      <div className="live-race-stadium__crowd-ring">
        {stadiumCrowd.map((spectator) => (
          <i
            className={`live-race-spectator live-race-spectator--row-${spectator.row}`}
            key={`spectator-${spectator.id}`}
            style={{ "--crowd-position": `${spectator.position}%` }}
          />
        ))}
      </div>
      {Array.from({ length: 4 }, (_, index) => (
        <span className={`live-race-stadium__floodlight live-race-stadium__floodlight--${index + 1}`} key={`floodlight-${index}`} />
      ))}
    </div>
  );
}

function PodiumOverlay({ contendersById, playbackState, raceResult, ranking }) {
  const isOfficial = Boolean(raceResult?.results?.length);
  
  // Filter finished horses for live playback
  const finishedHorses = ranking.filter((item) => item.progress >= 1);
  const placements = isOfficial
    ? raceResult.results.filter((item) => item.position <= 3).sort((a, b) => a.position - b.position)
    : finishedHorses.slice(0, 3).map((item, idx) => ({
        finish_time_ms: item.finishTimeMs || item.finish_time_ms,
        horse_id: item.horseId || item.horse_id,
        position: idx + 1,
      }));

  if (!placements.length) return null;

  return (
    <div className="live-race-podium" role="status" aria-label="Top three finishers">
      <div className="live-race-podium__heading">
        <Trophy size={18} />
        <div><span>{isOfficial ? "Official result" : "Provisional result"}</span><strong>Finish ranking</strong></div>
      </div>
      <div className="live-race-podium__grid">
        {placements.map((result) => {
          const horse = contendersById.get(result.horse_id);
          return (
            <article className={`live-race-podium__place live-race-podium__place--${result.position} animate-result-fly-in`} key={result.horse_id}>
              <span>#{result.position}</span>
              <img src={horse?.image} alt="" />
              <div><strong>{horse?.horse || result.horse_id}</strong><small>Lane {horse?.lane} / {formatRaceTime(result.finish_time_ms)}</small></div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function RaceViewer2D({
  children,
  connectionState,
  contenders,
  eyebrow = "Live 2D track",
  race,
  raceResult,
  raceScript,
  rankingEyebrow = "Live order",
  rankingStateLabel,
  rankingTitle = "Track positions",
  statusLabel,
}) {
  const playback = useRacePlayback({ connectionState, raceId: race.id, raceResult, raceScript });
  const contendersById = new Map(contenders.map((horse) => [horse.id, horse]));
  const ranking = playback.ranking.length ? playback.ranking : contenders.map((horse, index) => {
    const mappedPosition = Number(horse.position);
    return {
      horseId: horse.id,
      lane: horse.lane,
      name: horse.horse,
      position: Number.isInteger(mappedPosition) && mappedPosition > 0 ? mappedPosition : index + 1,
      progress: 0,
    };
  }).sort((left, right) => left.position - right.position);
  const startsAt = playback.script?.startsAt;
  const msRemaining = startsAt ? startsAt - Date.now() : 0;
  const showCountdown = playback.playbackState === "ready" && msRemaining > 0 && msRemaining <= 3000;
  const hasOfficialResult = Boolean(raceResult?.results?.length);
  const awaitingOfficialResult = race.raceStatus === "completed" && !hasOfficialResult;
  const showOfficialResults = hasOfficialResult && (race.raceStatus === "completed" || playback.playbackState === "finished");

  const visibleStatusLabel = statusLabel || stateLabels[playback.playbackState];
  const leader = ranking[0];
  const leaderHorse = contendersById.get(leader?.horseId);
  const isRacing = playback.playbackState === "racing";
  const raceDistance = Number.parseInt(String(race.distance).replace(/[^\d]/g, ""), 10) || 1000;

  const getGapLabel = (item) => {
    if (item.progress >= 1) return formatRaceTime(item.finishTimeMs);
    if (item.position === 1) return "Leader";
    const abstractGap = Math.max(0, (leader?.distance || 0) - (item.distance || 0));
    const gapMetres = Math.round((abstractGap / (playback.script?.trackLength || 1000)) * raceDistance);
    return gapMetres > 0 ? `+${gapMetres}m` : "Level";
  };

  return (
    <>
      <section className={`live-race-viewer live-race-viewer--${playback.playbackState}`} aria-label={`2D race viewer for ${race.name}`}>
        <div className="live-race-viewer__header">
          <div><span className="live-race-kicker"><Activity size={14} /> {eyebrow}</span><h2>{race.name}</h2></div>
          <div className={`live-race-viewer__status live-race-viewer__status--${connectionState}`}><span className="live-race-dot" /> {visibleStatusLabel}</div>
        </div>

        {playback.scriptError && <div className="live-race-state-message live-race-state-message--error" role="alert">{playback.scriptError}</div>}

        {showOfficialResults ? (
          <div className="official-results-container">
            <div className="official-results-modal animate-results-modal">
              <div className="official-results-modal__header">
                <Trophy size={32} className="official-results-modal__icon" />
                <div>
                  <span>Official Race Results</span>
                  <h1>{race.name}</h1>
                </div>
              </div>
              <div className="official-results-modal__divider" />
              <div className="official-results-modal__list">
                {ranking.map((item) => {
                  const horse = contendersById.get(item.horseId || item.horse_id);
                  const medalClass = item.position === 1 ? "gold" : item.position === 2 ? "silver" : item.position === 3 ? "bronze" : "other";
                  return (
                    <div className={`official-results-modal__row official-results-modal__row--${medalClass}`} key={item.horseId || item.horse_id}>
                      <span className="official-results-modal__position">#{item.position}</span>
                      <img src={horse?.image} className="official-results-modal__avatar" alt="" />
                      <div className="official-results-modal__identity">
                        <strong>{horse?.horse || item.name}</strong>
                        <small>Lane {item.lane} / Jockey: {horse?.jockey}</small>
                      </div>
                      <span className="official-results-modal__time">{formatRaceTime(item.finishTimeMs || item.finish_time_ms || 0)}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ) : (
          <div className="live-race-track live-race-track--oval" ref={playback.registerTrack}>
            <StadiumEnvironment />
            {showCountdown && (
              <div className="live-race-countdown-overlay" role="status" aria-live="polite">
                <div className="live-race-countdown-number">
                  {Math.ceil(msRemaining / 1000)}
                </div>
              </div>
            )}
            {playback.playbackState === "ready" && !showCountdown && (
              <div className="live-race-start-callout" role="status">
                <Flag size={18} />
                <span><small>Starting line</small><strong>Runners are set at the gate</strong></span>
              </div>
            )}
            {isRacing && (
              <div className="live-race-broadcast" aria-live="polite">
                <span><Activity size={13} /> Live</span>
                <strong>{playback.racePhase}</strong>
              </div>
            )}
            {isRacing && leaderHorse && (
              <div className="live-race-leader-callout">
                <Sparkles size={14} />
                <span><small>Current leader</small><strong>#{leaderHorse.lane} {leaderHorse.horse}</strong></span>
              </div>
            )}
            <div className="live-race-oval__outer-rail" aria-hidden="true" />
            <div className="live-race-oval__inner-rail" aria-hidden="true" />
            <div className="live-race-oval__distance-markers" aria-hidden="true">
              <span className="live-race-distance-marker live-race-distance-marker--250">250m</span>
              <span className="live-race-distance-marker live-race-distance-marker--500">500m</span>
              <span className="live-race-distance-marker live-race-distance-marker--750">750m</span>
            </div>
            <div className="live-race-oval__field" aria-hidden="true"><Flag size={16} /><span>{race.name}</span><small>{race.distance}</small></div>
            {Array.from({ length: 8 }, (_, i) => i + 1).map((lane) => (
              <div className={`live-race-oval__lane live-race-oval__lane--${lane}`} key={`lane-${lane}`} aria-hidden="true" />
            ))}
            <div className="live-race-oval__finish" aria-hidden="true">
              <Flag size={16} className="live-race-finish-flag live-race-finish-flag--outer" />
              <span className="live-race-finish-text live-race-finish-text--outer">
                {playback.playbackState === "ready" ? "Start" : "Finish"}
              </span>
              <Flag size={16} className="live-race-finish-flag live-race-finish-flag--inner" />
              <span className="live-race-finish-text live-race-finish-text--inner">
                {playback.playbackState === "ready" ? "Start" : "Finish"}
              </span>
            </div>
            {playback.script && contenders.map((horse) => (
              <div className={`live-race-oval-runner live-race-oval-runner--${horse.lane}`} key={horse.id} ref={(marker) => playback.registerRunner(horse.id, marker)} style={{ "--runner-color": horse.color }}>
                <img src={horse.image} alt="" />
                <span>{horse.lane}</span>
              </div>
            ))}
            {!awaitingOfficialResult && <PodiumOverlay contendersById={contendersById} playbackState={playback.playbackState} raceResult={raceResult} ranking={ranking} />}
          </div>
        )}

        <div className="live-race-viewer__footer">
          <span><Clock3 size={14} /> {formatRaceTime(playback.elapsedMs)}</span>
          <span><Flag size={14} /> {race.distance}</span>
          <span><ShieldCheck size={14} /> {visibleStatusLabel}</span>
        </div>
      </section>

      <div className="live-race-lower-grid">
        <section className="live-race-ranking" aria-label="Live race ranking" aria-live={raceResult ? "polite" : "off"}>
          <div className="live-race-section-heading"><div><span className="live-race-kicker"><Medal size={14} /> {rankingEyebrow}</span><h2>{rankingTitle}</h2></div><small>{rankingStateLabel || (raceResult ? "Official" : awaitingOfficialResult ? "Pending" : "Provisional")}</small></div>
          <div className="live-race-ranking__list">
            {awaitingOfficialResult ? (
              <div className="live-race-state-message" role="status">Official Race Engine standings will appear here once confirmed results are available.</div>
            ) : ranking.map((item) => {
              const horse = contendersById.get(item.horseId);
              return (
                <div className={`live-race-ranking__row${item.position === 1 && isRacing ? " is-leading" : ""}`} key={item.horseId}>
                  <span>{item.position}</span><img src={horse?.image} alt="" />
                  <div><strong>{horse?.horse || item.name}</strong><small>Lane {item.lane} / {horse?.jockey}</small></div>
                  <b>{raceResult ? formatRaceTime(item.finishTimeMs) : getGapLabel(item)}</b>
                </div>
              );
            })}
          </div>
        </section>
        {children}
      </div>
    </>
  );
}
