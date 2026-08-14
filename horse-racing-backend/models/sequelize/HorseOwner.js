'use strict';

/**
 * Sequelize model — `horse_owners` table.
 * Extended profile (1:1 to users) for horse_owner role.
 */

module.exports = (sequelize, DataTypes) => {
    const HorseOwner = sequelize.define(
        'horse_owners',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            stable_name: { type: DataTypes.STRING(255) },
            address: { type: DataTypes.TEXT },
            license_number: { type: DataTypes.STRING(128) },
            status: {
                type: DataTypes.STRING(32),
                allowNull: false,
                defaultValue: 'active',
                validate: { isIn: [['active', 'inactive', 'suspended']] }
            }
        },
        {
            tableName: 'horse_owners',
            indexes: [
                { name: 'horse_owners_license_uniq', unique: true, fields: ['license_number'], where: { license_number: { [sequelize.Sequelize.Op.ne]: null }, deleted_at: null } }
            ]
        }
    );

    HorseOwner.associate = (models) => {
        HorseOwner.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        HorseOwner.hasMany(models.Horse, { foreignKey: 'owner_id', as: 'horses' });
        HorseOwner.hasMany(models.Registration, { foreignKey: 'owner_id', as: 'registrations' });
        HorseOwner.hasMany(models.JockeyAssignment, { foreignKey: 'owner_id', as: 'jockey_assignments' });
        HorseOwner.hasMany(models.RegistrationCancellationTicket, { foreignKey: 'owner_id', as: 'cancellation_tickets' });
        HorseOwner.hasMany(models.PrizeAward, { foreignKey: 'owner_id', as: 'prize_awards' });
    };

    return HorseOwner;
};