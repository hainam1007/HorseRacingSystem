'use strict';

/**
 * Sequelize model — `registration_gears` table.
 * Child of Registration — array of gear enum codes.
 */

module.exports = (sequelize, DataTypes) => {
    const RegistrationGear = sequelize.define(
        'registration_gears',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            registration_id: { type: DataTypes.UUID, allowNull: false },
            gear_code: {
                type: DataTypes.STRING(8),
                allowNull: false,
                validate: { isIn: [['B', 'BO', 'V', 'TT', 'CP', 'CO', 'H', 'P', 'PC', 'PS', 'SR', 'SB', 'E', 'XB', 'CC']] }
            }
        },
        {
            tableName: 'registration_gears',
            timestamps: false,
            indexes: [
                { name: 'registration_gears_uniq', unique: true, fields: ['registration_id', 'gear_code'], where: { deleted_at: null } }
            ]
        }
    );

    RegistrationGear.associate = (models) => {
        RegistrationGear.belongsTo(models.Registration, { foreignKey: 'registration_id', as: 'registration' });
    };

    return RegistrationGear;
};