const mongoose = require('mongoose');

const { Schema } = mongoose;

const roleApplicationSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    requested_role: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    status: {
      type: String,
      default: 'pending',
      trim: true,
      index: true
    },
    application_data: {
      type: Schema.Types.Mixed,
      default: {}
    },
    documents: [
      {
        type: {
          type: String,
          trim: true
        },
        url: String,
        public_id: String,
        note: String
      }
    ],
    admin_note: String,
    reviewed_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    reviewed_at: Date
  },
  {
    collection: 'role_applications',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

roleApplicationSchema.index({ user_id: 1, requested_role: 1, status: 1 });

module.exports = mongoose.model('RoleApplication', roleApplicationSchema);
