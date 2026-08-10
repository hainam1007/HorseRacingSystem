const mongoose = require('mongoose');

const { Schema } = mongoose;

const walletSchema = new Schema(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true
    },
    token_balance: {
      type: Number,
      default: 0,
      min: [0, 'Token balance cannot be negative']
    }
  },
  {
    collection: 'wallets',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

module.exports = mongoose.model('Wallet', walletSchema);
