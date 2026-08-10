const mongoose = require('mongoose');

const { Schema } = mongoose;
const ACTIVE_PRIMARY_STATUSES = [
  'pending',
  'meeting_invited',
  'meeting_accepted',
  'terms_pending_confirmation',
  'terms_agreed',
  'terms_rejected',
  'contract_uploaded',
  'accepted'
];
const ACTIVE_BACKUP_STATUSES = [
  ...ACTIVE_PRIMARY_STATUSES,
  'standby_terms_pending_confirmation',
  'standby_confirmed'
];

const jockeyAssignmentSchema = new Schema(
  {
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
    jockey_id: {
      type: Schema.Types.ObjectId,
      ref: 'Jockey',
      required: true,
      index: true
    },
    assignment_type: {
      type: String,
      enum: ['primary', 'backup'],
      default: 'primary',
      index: true
    },
    backup_priority: {
      type: Number,
      min: 1
    },
    backup_for_assignment_id: {
      type: Schema.Types.ObjectId,
      ref: 'JockeyAssignment'
    },
    status: {
      type: String,
      default: 'meeting_invited',
      trim: true
    },
    invitation_message: String,
    meeting: {
      title: {
        type: String,
        trim: true
      },
      meeting_url: String,
      meeting_time: Date,
      location_name: {
        type: String,
        trim: true
      },
      address: {
        type: String,
        trim: true
      },
      city: {
        type: String,
        trim: true
      },
      district: {
        type: String,
        trim: true
      },
      ward: {
        type: String,
        trim: true
      },
      map_url: String,
      contact_name: {
        type: String,
        trim: true
      },
      contact_phone: {
        type: String,
        trim: true
      },
      note: String,
      accepted_at: Date,
      rejected_at: Date,
      response_message: String
    },
    terms: {
      agreed_terms: String,
      meeting_note: String,
      agreed_at: Date,
      sent_at: Date,
      confirmed_at: Date,
      rejected_at: Date,
      response_message: String,
      updated_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    standby_terms: {
      agreed_terms: String,
      meeting_note: String,
      agreed_at: Date,
      sent_at: Date,
      confirmed_at: Date,
      rejected_at: Date,
      response_message: String,
      updated_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      }
    },
    contract: {
      contract_number: {
        type: String,
        trim: true
      },
      title: {
        type: String,
        trim: true
      },
      file_url: String,
      file_public_id: String,
      file_type: {
        type: String,
        trim: true
      },
      file_name: {
        type: String,
        trim: true
      },
      signed_at: Date,
      uploaded_at: Date,
      confirmed_at: Date,
      rejected_at: Date,
      response_message: String,
      note: String
    },
    standby_contract: {
      contract_number: {
        type: String,
        trim: true
      },
      title: {
        type: String,
        trim: true
      },
      file_url: String,
      file_public_id: String,
      file_type: {
        type: String,
        trim: true
      },
      file_name: {
        type: String,
        trim: true
      },
      signed_at: Date,
      uploaded_at: Date,
      confirmed_at: Date,
      rejected_at: Date,
      response_message: String,
      note: String
    },
    promotion: {
      promoted_at: Date,
      promoted_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: String,
      previous_primary_assignment_id: {
        type: Schema.Types.ObjectId,
        ref: 'JockeyAssignment'
      }
    },
    cancellation_request: {
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected']
      },
      initiated_by_party: {
        type: String,
        enum: ['horse_owner', 'jockey']
      },
      initiated_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: {
        type: String,
        trim: true,
        maxlength: 1000
      },
      requested_at: Date,
      responded_by_party: {
        type: String,
        enum: ['horse_owner', 'jockey']
      },
      responded_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      response_message: {
        type: String,
        trim: true,
        maxlength: 1000
      },
      responded_at: Date
    },
    withdrawal: {
      initiated_by_party: {
        type: String,
        enum: ['horse_owner', 'jockey']
      },
      initiated_by: {
        type: Schema.Types.ObjectId,
        ref: 'User'
      },
      reason: {
        type: String,
        trim: true,
        maxlength: 1000
      },
      withdrawn_at: Date
    },
    response_message: String,
    invited_at: {
      type: Date,
      default: Date.now
    },
    responded_at: Date
  },
  {
    collection: 'jockey_assignments',
    versionKey: false
  }
);

jockeyAssignmentSchema.index(
  { race_id: 1, horse_id: 1, assignment_type: 1, status: 1 },
  { name: 'jockey_assignment_role_status_idx' }
);
jockeyAssignmentSchema.index(
  { race_id: 1, horse_id: 1, assignment_type: 1 },
  {
    unique: true,
    name: 'one_active_primary_assignment_per_horse_race_v2',
    partialFilterExpression: {
      assignment_type: 'primary',
      status: { $in: ACTIVE_PRIMARY_STATUSES }
    }
  }
);
jockeyAssignmentSchema.index(
  { race_id: 1, horse_id: 1, assignment_type: 1 },
  {
    unique: true,
    name: 'one_active_backup_assignment_per_horse_race_v2',
    partialFilterExpression: {
      assignment_type: 'backup',
      status: { $in: ACTIVE_BACKUP_STATUSES }
    }
  }
);
jockeyAssignmentSchema.index(
  { race_id: 1, jockey_id: 1 },
  {
    unique: true,
    name: 'one_confirmed_horse_per_jockey_race',
    partialFilterExpression: {
      status: { $in: ['accepted', 'standby_confirmed'] }
    }
  }
);
jockeyAssignmentSchema.index({ race_id: 1, horse_id: 1, backup_priority: 1 });
jockeyAssignmentSchema.index({ race_id: 1, status: 1 });

module.exports = mongoose.model('JockeyAssignment', jockeyAssignmentSchema);
