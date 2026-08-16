'use strict';

/**
 * Sequelize model — `horses` table.
 * Note: `default_gears` array is normalized to `horse_default_gears` child table.
 */

module.exports = (sequelize, DataTypes) => {
    const Horse = sequelize.define(
        'horses',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            owner_id: { type: DataTypes.UUID, allowNull: false },
            name: { type: DataTypes.STRING(255), allowNull: false },
            breed: { type: DataTypes.STRING(255) },
            gender: { type: DataTypes.STRING(32) },
            date_of_birth: { type: DataTypes.DATE },
            color: { type: DataTypes.STRING(64) },
            weight: { type: DataTypes.DECIMAL(6, 2) },
            current_rating: { type: DataTypes.INTEGER, defaultValue: 50, validate: { min: 0, max: 140 } },
            rating_updated_at: { type: DataTypes.DATE },
            rating_updated_by: { type: DataTypes.UUID },
            health_status: { type: DataTypes.STRING(64) },
            registration_number: { type: DataTypes.STRING(128), allowNull: false, unique: true },
            image_url: { type: DataTypes.STRING(512) },
            image_public_id: { type: DataTypes.STRING(255) },
            status: { type: DataTypes.STRING(32), defaultValue: 'active' }
        },
        { tableName: 'horses' }
    );

    Horse.associate = (models) => {
        Horse.belongsTo(models.HorseOwner, { foreignKey: 'owner_id', as: 'owner' });
        Horse.belongsTo(models.User, { foreignKey: 'rating_updated_by', as: 'rating_updater' });
        Horse.hasMany(models.HorseDefaultGear, { foreignKey: 'horse_id', as: 'default_gears' });
        Horse.hasMany(models.Registration, { foreignKey: 'horse_id', as: 'registrations' });
        Horse.hasMany(models.JockeyAssignment, { foreignKey: 'horse_id', as: 'assignments' });
        Horse.hasMany(models.HorseCheck, { foreignKey: 'horse_id', as: 'horse_checks' });
        Horse.hasMany(models.RaceResult, { foreignKey: 'horse_id', as: 'race_results' });
        Horse.hasMany(models.Violation, { foreignKey: 'horse_id', as: 'violations' });
        Horse.hasMany(models.HorseRatingHistory, { foreignKey: 'horse_id', as: 'rating_history' });
        Horse.hasMany(models.PrizeAward, { foreignKey: 'horse_id', as: 'prize_awards' });
        Horse.hasMany(models.Bet, { foreignKey: 'predicted_horse_id', as: 'bets_on' });
    };

    return Horse;
};