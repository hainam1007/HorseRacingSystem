'use strict';

/**
 * Sequelize model — `jockeys` table.
 * Extended profile (1:1 to users) for jockey role.
 */

module.exports = (sequelize, DataTypes) => {
    const Jockey = sequelize.define(
        'jockeys',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            user_id: { type: DataTypes.UUID, allowNull: false, unique: true },
            height: { type: DataTypes.INTEGER },
            weight: { type: DataTypes.INTEGER },
            weight_kg: { type: DataTypes.DECIMAL(6, 2), validate: { min: 30, max: 100 } },
            experience_years: { type: DataTypes.INTEGER, defaultValue: 0 },
            license_number: { type: DataTypes.STRING(128) },
            total_races: { type: DataTypes.INTEGER, defaultValue: 0 },
            total_wins: { type: DataTypes.INTEGER, defaultValue: 0 },
            suspended_until: { type: DataTypes.DATE },
            outstanding_fine_amount: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, validate: { min: 0 } },
            disciplinary_status: {
                type: DataTypes.STRING(32),
                defaultValue: 'clear',
                validate: { isIn: [['clear', 'suspended']] }
            },
            status: { type: DataTypes.STRING(32), defaultValue: 'active' }
        },
        { tableName: 'jockeys' }
    );

    Jockey.associate = (models) => {
        Jockey.belongsTo(models.User, { foreignKey: 'user_id', as: 'user' });
        Jockey.hasMany(models.JockeyAssignment, { foreignKey: 'jockey_id', as: 'assignments' });
        Jockey.hasMany(models.HorseCheck, { foreignKey: 'jockey_id', as: 'horse_checks' });
        Jockey.hasMany(models.RaceResult, { foreignKey: 'jockey_id', as: 'race_results' });
        Jockey.hasMany(models.Violation, { foreignKey: 'jockey_id', as: 'violations' });
        Jockey.hasMany(models.PrizeAward, { foreignKey: 'jockey_id', as: 'prize_awards' });
    };

    return Jockey;
};