const mongoose = require('mongoose');

const { Schema } = mongoose;

const redemptionHistorySchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    item_id: {
      type: Schema.Types.ObjectId,
      ref: 'RewardItem',
      required: true,
      index: true
    },
    /** Token amount that was deducted at the time of redemption */
    token_spent: {
      type: Number,
      required: true,
      min: [0, 'token_spent cannot be negative']
    },
    /**
     * pending    — created, awaiting fulfilment
     * processing — being handled by fulfilment team
     * completed  — delivered to user
     * cancelled  — cancelled (token refund handled separately if applicable)
     */
    status: {
      type: String,
      default: 'pending',
      enum: ['pending', 'processing', 'completed', 'cancelled'],
      trim: true
    },
    /** Foreign key to the corresponding TransactionHistory debit record */
    transaction_id: {
      type: Schema.Types.ObjectId,
      ref: 'TransactionHistory',
      index: true
    },
    /** Optional shipping / delivery info for physical items */
    delivery_info: {
      type: Schema.Types.Mixed,
      default: null
    }
  },
  {
    collection: 'redemption_histories',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('RedemptionHistory', redemptionHistorySchema);
