const mongoose = require('mongoose');

const { Schema } = mongoose;

const raceRefereeSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    license_number: {
      type: String,
      trim: true
    },
    experience_years: {
      type: Number,
      default: 0
    },
    status: {
      type: String,
      default: 'active',
      trim: true
    }
  },
  {
    collection: 'race_referees',
    versionKey: false
  }
);

module.exports = mongoose.model('RaceReferee', raceRefereeSchema);
