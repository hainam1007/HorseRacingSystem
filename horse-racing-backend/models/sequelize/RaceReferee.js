'use strict';

/**
 * Sequelize model — `race_referees` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceReferee = sequelize.define(
        'race_referees',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            license_number: { type: DataTypes.STRING(128) },
            experience_years: { type: DataTypes.INTEGER, defaultValue: 0 },
            status: { type: DataTypes.STRING(32), defaultValue: 'active' }
        },
        { tableName: 'race_referees' }
    );

    RaceReferee.associate = (models) => {
        RaceReferee.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        RaceReferee.hasMany(models.Race, { foreignKey: 'referee_id', as: 'races' });
        RaceReferee.hasMany(models.HorseCheck, { foreignKey: 'referee_id', as: 'horse_checks' });
        RaceReferee.hasMany(models.RefereeReport, { foreignKey: 'referee_id', as: 'referee_reports' });
        RaceReferee.hasMany(models.Violation, { foreignKey: 'referee_id', as: 'violations' });
        RaceReferee.hasMany(models.RaceResult, { foreignKey: 'recorded_by', as: 'recorded_results' });
    };

    return RaceReferee;
};