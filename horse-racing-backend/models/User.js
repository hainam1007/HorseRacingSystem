const mongoose = require('mongoose');

const { Schema } = mongoose;

const userSchema = new Schema(
  {
    full_name: {
      type: String,
      required: true,
      trim: true
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true
    },
    password: {
      type: String,
      required: true,
      select: false
    },
    phone_number: {
      type: String,
      trim: true
    },
    date_of_birth: Date,
    avatar_url: String,
    avatar_public_id: String,
    status: {
      type: String,
      default: 'active',
      trim: true
    },
    email_verified: {
      type: Boolean,
      default: false
    },
    email_verified_at: Date,
    email_verification_token: {
      type: String,
      select: false
    },
    email_verification_expires_at: {
      type: Date,
      select: false
    },
    password_reset_token: {
      type: String,
      select: false
    },
    password_reset_expires_at: {
      type: Date,
      select: false
    },
    password_changed_at: Date
  },
  {
    collection: 'users',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('User', userSchema);
