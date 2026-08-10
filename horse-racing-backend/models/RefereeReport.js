const mongoose = require('mongoose');

const { Schema } = mongoose;

const refereeReportSchema = new Schema(
  {
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      index: true
    },
    referee_id: {
      type: Schema.Types.ObjectId,
      ref: 'RaceReferee',
      required: true,
      index: true
    },
    report_title: {
      type: String,
      required: true,
      trim: true
    },
    report_content: String,
    race_condition: {
      type: String,
      trim: true
    },
    weather: {
      type: String,
      trim: true
    },
    track_condition: {
      type: String,
      trim: true
    },
    conclusion: String,
    status: {
      type: String,
      default: 'draft',
      trim: true
    },
    created_at: {
      type: Date,
      default: Date.now
    },
    submitted_at: Date
  },
  {
    collection: 'referee_reports',
    versionKey: false
  }
);

refereeReportSchema.index({ referee_id: 1, race_id: 1, status: 1 });
refereeReportSchema.index({ race_id: 1, status: 1 });

module.exports = mongoose.model('RefereeReport', refereeReportSchema);
