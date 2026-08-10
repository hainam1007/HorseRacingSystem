const mongoose = require('mongoose');

const { Schema } = mongoose;

const rewardItemSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    /**
     * Price in Tokens. Must be a positive integer.
     */
    token_price: {
      type: Number,
      required: true,
      min: [1, 'token_price must be at least 1']
    },
    /** Available quantity. Decremented atomically on each redemption. */
    stock: {
      type: Number,
      required: true,
      default: 0,
      min: [0, 'Stock cannot be negative']
    },
    /** Soft-delete / visibility flag. Admin can disable without deleting. */
    is_active: {
      type: Boolean,
      default: true
    },
    image_url: {
      type: String,
      trim: true
    },
    created_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    updated_by: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    collection: 'reward_items',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('RewardItem', rewardItemSchema);
