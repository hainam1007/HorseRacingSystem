const mongoose = require('mongoose');

const { Schema } = mongoose;

const jockeySchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    height: Number,
    weight: Number,
    weight_kg: {
      type: Number,
      min: 30,
      max: 100
    },
    experience_years: {
      type: Number,
      default: 0
    },
    license_number: {
      type: String,
      trim: true
    },
    total_races: {
      type: Number,
      default: 0
    },
    total_wins: {
      type: Number,
      default: 0
    },
    suspended_until: Date,
    outstanding_fine_amount: {
      type: Number,
      default: 0,
      min: 0
    },
    disciplinary_status: {
      type: String,
      enum: ['clear', 'suspended'],
      default: 'clear'
    },
    status: {
      type: String,
      default: 'active',
      trim: true
    }
  },
  {
    collection: 'jockeys',
    versionKey: false
  }
);

module.exports = mongoose.model('Jockey', jockeySchema);
