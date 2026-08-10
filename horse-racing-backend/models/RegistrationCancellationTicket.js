const mongoose = require('mongoose');
const {
  CANCELLATION_TICKET_STATUS,
  REFUND_STATUS
} = require('../constants/statuses');

const { Schema } = mongoose;

const registrationCancellationTicketSchema = new Schema(
  {
    registration_id: {
      type: Schema.Types.ObjectId,
      ref: 'Registration',
      required: true,
      index: true
    },
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
    owner_id: {
      type: Schema.Types.ObjectId,
      ref: 'HorseOwner',
      required: true,
      index: true
    },
    horse_id: {
      type: Schema.Types.ObjectId,
      ref: 'Horse',
      required: true,
      index: true
    },
    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    status: {
      type: String,
      enum: Object.values(CANCELLATION_TICKET_STATUS),
      default: CANCELLATION_TICKET_STATUS.PENDING,
      index: true
    },
    refund_status: {
      type: String,
      enum: Object.values(REFUND_STATUS),
      default: REFUND_STATUS.NOT_REQUIRED,
      index: true
    },
    refund_amount_vnd: {
      type: Number,
      default: 0,
      min: 0
    },
    requested_at: {
      type: Date,
      default: Date.now
    },
    reviewed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewed_at: Date,
    admin_note: {
      type: String,
      trim: true,
      maxlength: 1000
    },
    refund_reference: {
      type: String,
      trim: true,
      maxlength: 255
    },
    refund_sent_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    refund_sent_at: Date,
    owner_confirmed_at: Date,
    owner_confirmation_note: {
      type: String,
      trim: true,
      maxlength: 1000
    }
  },
  {
    collection: 'registration_cancellation_tickets',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

registrationCancellationTicketSchema.index(
  { registration_id: 1, status: 1 },
  {
    unique: true,
    name: 'one_pending_cancellation_ticket_per_registration',
    partialFilterExpression: {
      status: CANCELLATION_TICKET_STATUS.PENDING
    }
  }
);
registrationCancellationTicketSchema.index({ owner_id: 1, created_at: -1 });
registrationCancellationTicketSchema.index({ status: 1, created_at: 1 });

module.exports = mongoose.model(
  'RegistrationCancellationTicket',
  registrationCancellationTicketSchema
);
