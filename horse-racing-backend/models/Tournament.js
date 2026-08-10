const mongoose = require('mongoose');

const { Schema } = mongoose;

const tournamentSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: String,
    location: {
      type: String,
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
    start_date: Date,
    end_date: Date,
    status: {
      type: String,
      default: 'draft',
      trim: true
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    }
  },
  {
    collection: 'tournaments',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('Tournament', tournamentSchema);
