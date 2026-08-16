'use strict';

/**
 * Sequelize model — `wallets` table.
 * One wallet per user. token_balance non-negative enforced by DB trigger.
 */

module.exports = (sequelize, DataTypes) => {
    const Wallet = sequelize.define(
        'wallets',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            token_balance: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } }
        },
        { tableName: 'wallets' }
    );

    Wallet.associate = (models) => {
        Wallet.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
    };

    return Wallet;
};