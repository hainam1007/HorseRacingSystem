const mongoose = require('mongoose');

const { Schema } = mongoose;

const horseOwnerSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },
    stable_name: {
      type: String,
      trim: true
    },
    address: {
      type: String,
      trim: true
    },
    license_number: {
      type: String,
      trim: true
    },
    status: {
      type: String,
      default: 'active',
      trim: true
    }
  },
  {
    collection: 'horse_owners',
    versionKey: false
  }
);

module.exports = mongoose.model('HorseOwner', horseOwnerSchema);
