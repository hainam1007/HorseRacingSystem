'use strict';

/**
 * Sequelize model — `violations` table.
 * `evidence_files[]` and `evidence_urls[]` → child + array; 3 penalty sub-docs
 * (suggested/proposed/penalty) → single child table with `slot` column.
 */

module.exports = (sequelize, DataTypes) => {
    const Violation = sequelize.define(
        'violations',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID },
            jockey_id: { type: DataTypes.UUID },
            referee_id: { type: DataTypes.UUID, allowNull: false },
            horse_check_id: { type: DataTypes.UUID },
            violation_type: {
                type: DataTypes.STRING(64),
                allowNull: false,
                validate: { isIn: [['dangerous_riding', 'interference', 'illegal_whip_use', 'lane_violation', 'false_start', 'equipment_violation', 'horse_abuse', 'disobey_referee', 'doping_suspected', 'track_safety_issue', 'other']] }
            },
            description: { type: DataTypes.TEXT },
            severity: {
                type: DataTypes.STRING(16),
                defaultValue: 'minor',
                validate: { isIn: [['minor', 'major', 'critical']] }
            },
            time_marker: { type: DataTypes.STRING(64) },
            decision: { type: DataTypes.STRING(255) },
            deviates_from_policy: { type: DataTypes.BOOLEAN, defaultValue: false },
            deviation_reason: { type: DataTypes.STRING(1000) },
            decision_scope: { type: DataTypes.STRING(64) },
            proposed_by: { type: DataTypes.UUID },
            proposed_at: { type: DataTypes.DATE },
            status: {
                type: DataTypes.STRING(32),
                defaultValue: 'recorded',
                validate: { isIn: [['recorded', 'under_review', 'confirmed', 'dismissed', 'resolved']] }
            },
            decided_by: { type: DataTypes.UUID },
            decided_at: { type: DataTypes.DATE },
            penalty_source: {
                type: DataTypes.STRING(32),
                validate: { isIn: [['auto_policy', 'policy_confirm', 'referee_adjustment', 'manual_admin']] }
            },
            policy_version: { type: DataTypes.STRING(32) },
            discipline_applied_at: { type: DataTypes.DATE },
            discipline_applied_by: { type: DataTypes.UUID },
            evidence_urls: { type: DataTypes.ARRAY(DataTypes.STRING) },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        },
        { tableName: 'violations' }
    );

    Violation.associate = (models) => {
        Violation.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        Violation.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        Violation.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
        Violation.belongsTo(models.RaceReferee, { foreignKey: 'referee_id', as: 'referee' });
        Violation.belongsTo(models.HorseCheck, { foreignKey: 'horse_check_id', as: 'horse_check' });
        Violation.belongsTo(models.User, { foreignKey: 'proposed_by', as: 'proposer' });
        Violation.belongsTo(models.User, { foreignKey: 'decided_by', as: 'decider' });
        Violation.belongsTo(models.User, { foreignKey: 'discipline_applied_by', as: 'discipline_applier' });
        Violation.hasMany(models.ViolationEvidenceFile, { foreignKey: 'violation_id', as: 'evidence_files' });
        Violation.hasMany(models.ViolationPenalty, { foreignKey: 'violation_id', as: 'penalties' });
    };

    return Violation;
};
