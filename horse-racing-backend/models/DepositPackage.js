const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Predefined VND deposit amounts. Each tier maps directly to a fixed
 * number of base tokens (1 Token = 1,000 VND) plus an optional bonus.
 *
 * Tiers are enforced at the schema level to prevent arbitrary pricing.
 */
const ALLOWED_VND_PRICES = [10000, 20000, 50000, 100000, 200000, 500000];

const depositPackageSchema = new Schema(
  {
    /**
     * Human-readable, stable identifier (e.g. "PKG_10K").
     * Used as the foreign key in DepositRequest so admins can rename
     * packages without breaking historical order records.
     */
    package_id: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      index: true
    },
    /** Label shown to users in the UI (e.g. "Gói 10.000đ"). */
    label: {
      type: String,
      required: true,
      trim: true
    },
    /** Amount the user pays in VND. Must be one of the approved tiers. */
    vnd_price: {
      type: Number,
      required: true,
      enum: {
        values: ALLOWED_VND_PRICES,
        message: `vnd_price must be one of: ${ALLOWED_VND_PRICES.join(', ')}`
      }
    },
    /**
     * Base tokens calculated from the exchange rate (vnd_price / 1000).
     * Stored explicitly so admin can override for special promotions.
     */
    token_received: {
      type: Number,
      required: true,
      min: [1, 'token_received must be at least 1']
    },
    /**
     * Extra tokens granted as a promotion on top of token_received.
     * total tokens credited = token_received + bonus_token.
     */
    bonus_token: {
      type: Number,
      default: 0,
      min: [0, 'bonus_token cannot be negative']
    },
    /** Soft-delete / visibility flag. Admin can disable without deleting. */
    is_active: {
      type: Boolean,
      default: true,
      index: true
    }
  },
  {
    collection: 'deposit_packages',
    timestamps: {
      createdAt: 'created_at',
      updatedAt: 'updated_at'
    },
    versionKey: false
  }
);

/**
 * Virtual: total tokens a user receives when purchasing this package.
 * Use .toObject({ virtuals: true }) or .toJSON({ virtuals: true }) to include.
 */
depositPackageSchema.virtual('total_token').get(function () {
  return this.token_received + this.bonus_token;
});

module.exports = mongoose.model('DepositPackage', depositPackageSchema);
