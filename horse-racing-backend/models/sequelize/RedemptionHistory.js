'use strict';

/**
 * Sequelize model — `redemption_histories` table.
 * `delivery_info` Mixed → JSONB.
 */

module.exports = (sequelize, DataTypes) => {
    const RedemptionHistory = sequelize.define(
        'redemption_histories',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false },
            item_id: { type: DataTypes.UUID, allowNull: false },
            token_spent: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 0 } },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'pending',
                validate: { isIn: [['pending', 'processing', 'completed', 'cancelled']] }
            },
            transaction_id: { type: DataTypes.UUID },
            delivery_info: { type: DataTypes.JSONB }
        },
        { tableName: 'redemption_histories' }
    );

    RedemptionHistory.associate = (models) => {
        RedemptionHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        RedemptionHistory.belongsTo(models.RewardItem, { foreignKey: 'item_id', as: 'item' });
        RedemptionHistory.belongsTo(models.TransactionHistory, { foreignKey: 'transaction_id', as: 'transaction' });
    };

    return RedemptionHistory;
};