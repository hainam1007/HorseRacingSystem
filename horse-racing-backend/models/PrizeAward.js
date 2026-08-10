const mongoose = require('mongoose');

const { Schema } = mongoose;

const prizeAwardSchema = new Schema(
  {
    prize_id: {
      type: Schema.Types.ObjectId,
      ref: 'Prize',
      required: true,
      index: true
    },
    race_result_id: {
      type: Schema.Types.ObjectId,
      ref: 'RaceResult',
      required: true
    },
    horse_id: {
      type: Schema.Types.ObjectId,
      ref: 'Horse',
      required: true,
      index: true
    },
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: 'HorseOwner',
      required: true,
      index: true
    },
    jockey_id: {
      type: Schema.Types.ObjectId,
      ref: 'Jockey',
      index: true
    },
    position: Number,
    amount: {
      type: Number,
      default: 0
    },
    gross_amount: {
      type: Number,
      default: 0
    },
    owner_amount: {
      type: Number,
      default: 0
    },
    jockey_amount: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'VND',
      trim: true,
      uppercase: true
    },
    status: {
      type: String,
      default: 'calculated',
      trim: true
    },
    awarded_at: Date,
    calculated_at: Date,
    approved_at: Date,
    approved_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    paid_at: Date,
    paid_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    collection: 'prize_awards',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

prizeAwardSchema.index({ race_result_id: 1 }, { unique: true });
prizeAwardSchema.index({ owner_id: 1, status: 1 });
prizeAwardSchema.index({ jockey_id: 1, status: 1 });

module.exports = mongoose.model('PrizeAward', prizeAwardSchema);
