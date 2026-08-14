'use strict';

/**
 * Sequelize model — `deposit_requests` table.
 * `package_id` is STRING FK → deposit_packages.package_id (stable across renames).
 */

module.exports = (sequelize, DataTypes) => {
    const DepositRequest = sequelize.define(
        'deposit_requests',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            order_id: { type: DataTypes.STRING(255), allowNull: false, unique: true },
            user_id: { type: DataTypes.UUID, allowNull: false },
            package_id: { type: DataTypes.STRING(64), allowNull: false },
            total_vnd: { type: DataTypes.DECIMAL(15, 2), allowNull: false, validate: { min: 1000 } },
            total_token: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
            payment_method: {
                type: DataTypes.STRING(16),
                allowNull: false,
                validate: { isIn: [['VNPAY', 'MOMO', 'MOCK']] }
            },
            status: {
                type: DataTypes.STRING(16),
                allowNull: false,
                defaultValue: 'pending',
                validate: { isIn: [['pending', 'success', 'failed']] }
            },
            gateway_reference_id: { type: DataTypes.STRING(255) },
            note: { type: DataTypes.STRING(500) }
        },
        {
            tableName: 'deposit_requests',
            indexes: [
                { name: 'deposit_requests_gateway_reference_id_uniq', unique: true, fields: ['gateway_reference_id'], where: { gateway_reference_id: { [sequelize.Sequelize.Op.ne]: null }, deleted_at: null } }
            ]
        }
    );

    DepositRequest.associate = (models) => {
        DepositRequest.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        DepositRequest.belongsTo(models.DepositPackage, { foreignKey: 'package_id', targetKey: 'package_id', as: 'package' });
    };

    return DepositRequest;
};