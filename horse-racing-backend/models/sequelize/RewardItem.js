'use strict';

/**
 * Sequelize model — `reward_items` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RewardItem = sequelize.define(
        'reward_items',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
            description: { type: DataTypes.TEXT },
            token_price: { type: DataTypes.INTEGER, allowNull: false, validate: { min: 1 } },
            stock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0, validate: { min: 0 } },
            is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
            image_url: { type: DataTypes.STRING(512) },
            created_by: { type: DataTypes.UUID },
            updated_by: { type: DataTypes.UUID }
        },
        { tableName: 'reward_items' }
    );

    RewardItem.associate = (models) => {
        RewardItem.belongsTo(models.User, { foreignKey: 'created_by', as: 'creator' });
        RewardItem.belongsTo(models.User, { foreignKey: 'updated_by', as: 'updater' });
        RewardItem.hasMany(models.RedemptionHistory, { foreignKey: 'item_id', as: 'redemptions' });
    };

    return RewardItem;
};