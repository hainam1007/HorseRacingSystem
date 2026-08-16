'use strict';

/**
 * Sequelize model — `deposit_packages` table.
 * `package_id` is STRING (not UUID) — used as FK target by deposit_requests.
 */

module.exports = (sequelize, DataTypes) => {
    const DepositPackage = sequelize.define(
        'deposit_packages',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            package_id: {
                type: DataTypes.STRING(64),
                allowNull: false,
                unique: true,
                validate: { is: /^PKG_[A-Z0-9_]+$/ }
            },
            label: { type: DataTypes.STRING(255), allowNull: false },
            vnd_price: {
                type: DataTypes.INTEGER,
                allowNull: false,
                validate: { isIn: [[10000, 20000, 50000, 100000, 200000, 500000]] }
            },
            token_received: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
            bonus_token: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
            is_active: { type: DataTypes.BOOLEAN, defaultValue: true }
        },
        { tableName: 'deposit_packages' }
    );

    DepositPackage.associate = (models) => {
        DepositPackage.hasMany(models.DepositRequest, { foreignKey: 'package_id', sourceKey: 'package_id', as: 'deposit_requests' });
    };

    return DepositPackage;
};