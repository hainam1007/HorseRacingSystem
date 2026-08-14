'use strict';

/**
 * Sequelize model — `transaction_histories` table.
 * Immutable audit log of every wallet movement. UPDATE/DELETE blocked by DB trigger.
 */

module.exports = (sequelize, DataTypes) => {
    const TransactionHistory = sequelize.define(
        'transaction_histories',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false },
            transaction_type: {
                type: DataTypes.STRING(32),
                allowNull: false,
                validate: { isIn: [['deposit', 'bet_deduct', 'bet_refund', 'bet_win', 'race_prize', 'redeem', 'registration_fee', 'registration_refund']] }
            },
            amount: { type: DataTypes.DECIMAL(15, 2), allowNull: false, validate: { min: 0 } },
            direction: {
                type: DataTypes.STRING(16),
                allowNull: false,
                validate: { isIn: [['credit', 'debit']] }
            },
            balance_before: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
            balance_after: { type: DataTypes.DECIMAL(15, 2), allowNull: false },
            status: {
                type: DataTypes.STRING(16),
                defaultValue: 'completed',
                validate: { isIn: [['pending', 'completed', 'failed']] }
            },
            reference_id: { type: DataTypes.STRING(255) },
            note: { type: DataTypes.STRING(500) }
        },
        {
            tableName: 'transaction_histories',
            indexes: [
                { name: 'transaction_histories_reference_id_uniq', unique: true, fields: ['reference_id'], where: { reference_id: { [sequelize.Sequelize.Op.ne]: null } } }
            ]
        }
    );

    TransactionHistory.associate = (models) => {
        TransactionHistory.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        TransactionHistory.hasMany(models.Registration, { foreignKey: 'payment_transaction_id', as: 'payment_registrations' });
        TransactionHistory.hasMany(models.RedemptionHistory, { foreignKey: 'transaction_id', as: 'redemptions' });
    };

    return TransactionHistory;
};