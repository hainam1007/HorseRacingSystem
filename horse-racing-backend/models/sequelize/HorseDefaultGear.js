'use strict';

/**
 * Sequelize model — `horse_default_gears` table.
 * Child of Horse — array of gear enum codes (HORSE_GEAR_CODES).
 */

module.exports = (sequelize, DataTypes) => {
    const HorseDefaultGear = sequelize.define(
        'horse_default_gears',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            gear_code: {
                type: DataTypes.STRING(8),
                allowNull: false,
                validate: { isIn: [['B', 'BO', 'V', 'TT', 'CP', 'CO', 'H', 'P', 'PC', 'PS', 'SR', 'SB', 'E', 'XB', 'CC']] }
            }
        },
        {
            tableName: 'horse_default_gears',
            timestamps: false,
            indexes: [
                { name: 'horse_default_gears_horse_gear_uniq', unique: true, fields: ['horse_id', 'gear_code'], where: { deleted_at: null } }
            ]
        }
    );

    HorseDefaultGear.associate = (models) => {
        HorseDefaultGear.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
    };

    return HorseDefaultGear;
};