'use strict';

/**
 * Sequelize model — `horse_rating_history` table.
 * Audit log of every ELO rating change per horse per race.
 */

module.exports = (sequelize, DataTypes) => {
    const HorseRatingHistory = sequelize.define(
        'horse_rating_history',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            race_id: { type: DataTypes.UUID },
            previous_rating: { type: DataTypes.INTEGER, allowNull: false },
            rating_delta: { type: DataTypes.INTEGER, allowNull: false },
            new_rating: { type: DataTypes.INTEGER, allowNull: false },
            expected_score: { type: DataTypes.DECIMAL(6, 5) },
            actual_score: { type: DataTypes.DECIMAL(6, 5) },
            raw_position: { type: DataTypes.INTEGER },
            participant_count: { type: DataTypes.INTEGER },
            calculation_version: { type: DataTypes.STRING(64), defaultValue: 'pairwise_elo_v1' },
            source: {
                type: DataTypes.STRING(32),
                allowNull: false,
                validate: { isIn: [['published_result', 'manual_admin', 'migration']] }
            },
            reason: { type: DataTypes.TEXT },
            calculated_by: { type: DataTypes.UUID },
            calculated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        },
        {
            tableName: 'horse_rating_history',
            timestamps: false,
            indexes: [
                { name: 'horse_rating_history_race_horse_uniq', unique: true, fields: ['race_id', 'horse_id'], where: { race_id: { [sequelize.Sequelize.Op.ne]: null }, source: 'published_result' } }
            ]
        }
    );

    HorseRatingHistory.associate = (models) => {
        HorseRatingHistory.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        HorseRatingHistory.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        HorseRatingHistory.belongsTo(models.User, { foreignKey: 'calculated_by', as: 'calculator' });
    };

    return HorseRatingHistory;
};