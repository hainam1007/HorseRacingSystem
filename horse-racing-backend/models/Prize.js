const mongoose = require('mongoose');

const { Schema } = mongoose;

const prizeSchema = new Schema(
  {
    tournament_id: {
      type: Schema.Types.ObjectId,
      ref: 'Tournament',
      required: true,
      index: true
    },
    race_id: {
      type: Schema.Types.ObjectId,
      ref: 'Race',
      required: true,
      index: true
    },
    prize_name: {
      type: String,
      required: true,
      trim: true
    },
    position: Number,
    amount: {
      type: Number,
      default: 0
    },
    percent: {
      type: Number,
      default: 0
    },
    currency: {
      type: String,
      default: 'VND',
      trim: true,
      uppercase: true
    },
    description: String
  },
  {
    collection: 'prizes',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

prizeSchema.index({ race_id: 1, position: 1 });

module.exports = mongoose.model('Prize', prizeSchema);
