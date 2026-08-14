'use strict';

/**
 * Sequelize model — `race_results` table.
 * `applied_violation_ids[]` and `penalty_snapshot_violation_ids[]` → child tables.
 */

module.exports = (sequelize, DataTypes) => {
    const RaceResult = sequelize.define(
        'race_results',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID, allowNull: false },
            position: { type: DataTypes.INTEGER },
            finish_time: { type: DataTypes.DECIMAL(8, 2) },
            score: { type: DataTypes.DECIMAL(8, 4) },
            raw_position: { type: DataTypes.INTEGER },
            raw_finish_time: { type: DataTypes.DECIMAL(8, 2) },
            raw_score: { type: DataTypes.DECIMAL(8, 4) },
            final_position: { type: DataTypes.INTEGER },
            final_finish_time: { type: DataTypes.DECIMAL(8, 2) },
            final_score: { type: DataTypes.DECIMAL(8, 4) },
            penalties_applied_by: { type: DataTypes.UUID },
            penalties_applied_at: { type: DataTypes.DATE },
            submitted_to_admin_by: { type: DataTypes.UUID },
            submitted_to_admin_at: { type: DataTypes.DATE },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'draft',
                validate: { isIn: [['draft', 'confirmed', 'published']] }
            },
            note: { type: DataTypes.TEXT },
            correction_requested: { type: DataTypes.BOOLEAN, defaultValue: false },
            correction_note: { type: DataTypes.TEXT },
            correction_requested_by: { type: DataTypes.UUID },
            correction_requested_at: { type: DataTypes.DATE },
            correction_resolved_by: { type: DataTypes.UUID },
            correction_resolved_at: { type: DataTypes.DATE },
            recorded_by: { type: DataTypes.UUID },
            recorded_at: { type: DataTypes.DATE },
            confirmed_by: { type: DataTypes.UUID },
            confirmed_at: { type: DataTypes.DATE },
            published_by: { type: DataTypes.UUID },
            published_at: { type: DataTypes.DATE }
        },
        {
            tableName: 'race_results',
            indexes: [
                { name: 'race_results_race_horse_uniq', unique: true, fields: ['race_id', 'horse_id'], where: { deleted_at: null } }
            ]
        }
    );

    RaceResult.associate = (models) => {
        RaceResult.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        RaceResult.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        RaceResult.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
        RaceResult.belongsTo(models.User, { foreignKey: 'penalties_applied_by', as: 'penalties_applied_by_user' });
        RaceResult.belongsTo(models.User, { foreignKey: 'submitted_to_admin_by', as: 'submitted_to_admin_by_user' });
        RaceResult.belongsTo(models.User, { foreignKey: 'correction_requested_by', as: 'correction_requested_by_user' });
        RaceResult.belongsTo(models.User, { foreignKey: 'correction_resolved_by', as: 'correction_resolved_by_user' });
        RaceResult.belongsTo(models.RaceReferee, { foreignKey: 'recorded_by', as: 'recorder' });
        RaceResult.belongsTo(models.User, { foreignKey: 'confirmed_by', as: 'confirmed_by_user' });
        RaceResult.belongsTo(models.User, { foreignKey: 'published_by', as: 'published_by_user' });
        RaceResult.hasMany(models.RaceResultAppliedViolation, { foreignKey: 'race_result_id', as: 'applied_violations' });
        RaceResult.hasMany(models.RaceResultPenaltySnapshotViolation, { foreignKey: 'race_result_id', as: 'penalty_snapshot_violations' });
        RaceResult.hasOne(models.PrizeAward, { foreignKey: 'race_result_id', as: 'prize_award' });
    };

    return RaceResult;
};