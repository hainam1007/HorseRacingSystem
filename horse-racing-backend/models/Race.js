const mongoose = require('mongoose');
const {
  MODEL_INPUT_DEFAULTS,
  RACE_CLASSES,
  RACE_COURSES,
  RACE_GOINGS,
  RACE_SURFACES
} = require('../constants/raceModelInput');

const { Schema } = mongoose;
const LOCK_OFFSET_MS = 3 * 60 * 60 * 1000;

function calculateRegistrationLockAt(raceDate) {
  if (!raceDate) {
    return undefined;
  }

  return new Date(new Date(raceDate).getTime() - LOCK_OFFSET_MS);
}

const raceSchema = new Schema(
  {
    tournament_id: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true
    },
    round_id: {
      type: Schema.Types.ObjectId,
      ref: 'Round',
      required: true,
      index: true
    },
    name: {
      type: String,
      required: true,
      trim: true
    },
    image_url: {
      type: String,
      trim: true
    },
    image_public_id: {
      type: String,
      trim: true
    },
    race_no: {
      type: Number,
      default: 1,
      min: 1
    },
    race_date: Date,
    distance: Number,
    max_participants: Number,
    location: {
      type: String,
      trim: true
    },
    venue_code: {
      type: String,
      trim: true,
      uppercase: true
    },
    course: {
      type: String,
      enum: RACE_COURSES,
      default: MODEL_INPUT_DEFAULTS.COURSE,
      trim: true
    },
    race_class: {
      type: String,
      enum: RACE_CLASSES,
      default: MODEL_INPUT_DEFAULTS.RACE_CLASS,
      trim: true
    },
    going: {
      type: String,
      enum: RACE_GOINGS,
      default: MODEL_INPUT_DEFAULTS.GOING,
      trim: true
    },
    surface: {
      type: String,
      enum: RACE_SURFACES,
      default: MODEL_INPUT_DEFAULTS.SURFACE,
      trim: true
    },
    referee_id: {
      type: Schema.Types.ObjectId,
      ref: 'RaceReferee',
      index: true
    },
    registration_lock_at: Date,
    registration_locked: {
      type: Boolean,
      default: false
    },
    registration_slot_count: {
      type: Number,
      default: 0,
      min: 0
    },
    registration_slots_initialized: {
      type: Boolean,
      default: false
    },
    entries_finalized_at: Date,
    entries_finalized_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    model_input_version: {
      type: Number,
      default: 0,
      min: 0
    },
    status: {
      type: String,
      default: 'scheduled',
      trim: true
    },
    starting_at: Date,
    started_at: Date,
    assignment_revision: {
      type: Number,
      default: 0,
      min: 0
    },
    betting_status: {
      type: String,
      default: 'unavailable',
      trim: true,
      index: true
    },
    betting_closes_at: Date,
    betting_market: {
      status: {
        type: String,
        trim: true
      },
      opens_at: Date,
      closes_at: Date,
      min_stake: Number,
      max_stake: Number,
      currency: {
        type: String,
        trim: true
      }
    },
    entry_fee: {
      type: Number,
      default: 0,
      min: 0
    },
    entry_fee_currency: {
      type: String,
      default: 'VND',
      trim: true,
      uppercase: true
    },
    prize_pool: {
      type: Number,
      default: 0,
      min: 0
    },
    prize_currency: {
      type: String,
      default: 'VND',
      trim: true,
      uppercase: true
    },
    prize_distribution: {
      type: [
        {
          position: {
            type: Number,
            required: true,
            min: 1
          },
          percent: {
            type: Number,
            min: 0,
            max: 100
          },
          amount: {
            type: Number,
            min: 0
          },
          label: {
            type: String,
            trim: true
          }
        }
      ],
      default: []
    }
  },
  {
    collection: 'races',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

raceSchema.pre('save', function() {
  if (this.race_date) {
    this.registration_lock_at = calculateRegistrationLockAt(this.race_date);
  }
});

raceSchema.pre('findOneAndUpdate', async function() {
  const update = this.getUpdate() || {};
  const set = update.$set || {};
  const raceDate = update.race_date || set.race_date;
  const hasRegistrationLockAt = update.registration_lock_at !== undefined || set.registration_lock_at !== undefined;

  if (raceDate) {
    set.registration_lock_at = calculateRegistrationLockAt(raceDate);
  } else if (hasRegistrationLockAt) {
    const race = await this.model.findOne(this.getQuery()).select('race_date');

    if (race && race.race_date) {
      set.registration_lock_at = calculateRegistrationLockAt(race.race_date);
    }
  }

  if (Object.keys(set).length) {
    update.$set = set;
  }

  delete update.registration_lock_at;
  this.setUpdate(update);
});

raceSchema.index({ registration_locked: 1, registration_lock_at: 1 });
raceSchema.index({ referee_id: 1, race_date: 1 });
raceSchema.index({ referee_id: 1, status: 1 });

module.exports = mongoose.model('Race', raceSchema);
