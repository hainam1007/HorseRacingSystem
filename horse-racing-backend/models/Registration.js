const mongoose = require('mongoose');
const { HORSE_GEAR_CODES, MODEL_INPUT_DEFAULTS } = require('../constants/raceModelInput');

const { Schema } = mongoose;

const registrationSchema = new Schema(
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
    horse_no: {
      type: Number,
      min: 1
    },
    draw: {
      type: Number,
      min: 1
    },
    rating_snapshot: {
      type: Number,
      min: 0,
      max: 140
    },
    gears: {
      type: [{ type: String, enum: HORSE_GEAR_CODES }],
      default: []
    },
    declared_weight_kg: {
      type: Number,
      default: MODEL_INPUT_DEFAULTS.DECLARED_WEIGHT_KG,
      min: 40,
      max: 75
    },
    entry_finalized_at: Date,
    entry_finalized_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    status: {
      type: String,
      default: 'pending',
      trim: true
    },
    note: String,
    admin_note: String,
    entry_fee_vnd: {
      type: Number,
      default: 0,
      min: 0
    },
    entry_fee_token: {
      type: Number,
      default: 0,
      min: 0
    },
    payment_status: {
      type: String,
      default: 'not_required',
      enum: ['not_required', 'pending', 'paid', 'failed', 'refund_pending', 'refund_sent', 'refunded'],
      trim: true,
      index: true
    },
    payment_method: {
      type: String,
      enum: ['VNPAY'],
      trim: true,
      uppercase: true
    },
    payment_order_id: {
      type: String,
      trim: true
    },
    payment_expires_at: Date,
    gateway_reference_id: {
      type: String,
      trim: true
    },
    payment_transaction_id: {
      type: Schema.Types.ObjectId,
      ref: 'TransactionHistory',
      index: true
    },
    payment_paid_at: Date,
    payment_refunded_at: Date,
    slot_reserved: {
      type: Boolean,
      default: false,
      index: true
    },
    slot_reserved_at: Date,
    slot_released_at: Date,
    registered_at: {
      type: Date,
      default: Date.now
    },
    approved_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      index: true
    },
    approved_at: Date
  },
  {
    collection: 'registrations',
    versionKey: false
  }
);

registrationSchema.index({ race_id: 1, horse_id: 1 }, { unique: true });
registrationSchema.index({ race_id: 1, status: 1 });
registrationSchema.index({ race_id: 1, horse_no: 1 }, { unique: true, sparse: true });
registrationSchema.index({ race_id: 1, draw: 1 }, { unique: true, sparse: true });
registrationSchema.index({ payment_order_id: 1 }, { unique: true, sparse: true });
registrationSchema.index({ gateway_reference_id: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model('Registration', registrationSchema);
