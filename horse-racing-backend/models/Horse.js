const mongoose = require('mongoose');
const { HORSE_GEAR_CODES, MODEL_INPUT_DEFAULTS } = require('../constants/raceModelInput');

const { Schema } = mongoose;

const horseSchema = new Schema(
  {
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: 'HorseOwner',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    breed: {
      type: String,
      trim: true
    },
    gender: {
      type: String,
      trim: true
    },
    date_of_birth: Date,
    color: {
      type: String,
      trim: true
    },
    weight: Number,
    current_rating: {
      type: Number,
      default: MODEL_INPUT_DEFAULTS.HORSE_RATING,
      min: 0,
      max: 140
    },
    rating_updated_at: Date,
    rating_updated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    default_gears: {
      type: [{ type: String, enum: HORSE_GEAR_CODES }],
      default: []
    },
    health_status: {
      type: String,
      trim: true
    },
    registration_number: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    image_url: String,
    image_public_id: String,
    status: {
      type: String,
      default: 'active',
      trim: true
    }
  },
  {
    collection: 'horses',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('Horse', horseSchema);
