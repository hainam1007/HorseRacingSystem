const PROBABILITY_MODEL = {
  NAME: 'probability_engine_history_v1',
  VERSION: 'history_v1.0.0',
  RUNTIME_DIR: 'app_probability_engine_history_v1_runtime',
  PAYOUT_FACTOR: 0.85,
  DATASET: {
    source: 'eprochasson/horserace_data HKJC',
    period: '2016-2018',
    total_races: 1509,
    total_runners: 18441,
    train_races: 1057,
    train_runners: 12969,
    validation_races: 452,
    validation_runners: 5472,
    validation_period: '2018'
  },
  VALIDATION_METRICS: {
    log_loss: 0.27844948771925954,
    brier_score: 0.07462790554442887,
    top1_accuracy: 0.22123893805309736,
    top3_accuracy: 0.48451327433628316,
    calibration_mae: 0.05901161311991457,
    favorite_win_rate: 0.22123893805309736
  },
  BASELINE_COMPARISON: {
    uniform_log_loss: 0.28396372472101333,
    uniform_brier: 0.07558965918340917,
    baseline_history_v0_log_loss: 0.2804,
    baseline_history_v0_brier_score: 0.075,
    baseline_history_v0_top1_accuracy: 0.186,
    baseline_history_v0_top3_accuracy: 0.449
  }
};

module.exports = {
  PROBABILITY_MODEL
};
