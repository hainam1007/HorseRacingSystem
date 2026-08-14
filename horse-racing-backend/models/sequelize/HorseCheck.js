'use strict';

/**
 * Sequelize model — `horse_checks` table.
 * `checklist` Mixed → JSONB; `issues[]` → child table.
 */

module.exports = (sequelize, DataTypes) => {
    const HorseCheck = sequelize.define(
        'horse_checks',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false },
            horse_id: { type: DataTypes.UUID, allowNull: false },
            jockey_id: { type: DataTypes.UUID },
            referee_id: { type: DataTypes.UUID, allowNull: false },
            phase: { type: DataTypes.STRING(32), defaultValue: 'pre_race' },
            status: { type: DataTypes.STRING(32), defaultValue: 'passed' },
            checklist: { type: DataTypes.JSONB, defaultValue: {} },
            event_type: { type: DataTypes.STRING(64) },
            severity: { type: DataTypes.STRING(32) },
            time_marker: { type: DataTypes.STRING(64) },
            description: { type: DataTypes.TEXT },
            evidence_urls: { type: DataTypes.ARRAY(DataTypes.STRING) },
            requires_violation: { type: DataTypes.BOOLEAN, defaultValue: false },
            linked_violation_id: { type: DataTypes.UUID },
            health_status: { type: DataTypes.STRING(64) },
            weight: { type: DataTypes.DECIMAL(6, 2) },
            check_note: { type: DataTypes.TEXT },
            is_eligible: { type: DataTypes.BOOLEAN, defaultValue: true },
            checked_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
        },
        {
            tableName: 'horse_checks',
            indexes: [
                { name: 'horse_checks_race_horse_phase_uniq', unique: true, fields: ['race_id', 'horse_id', 'phase'], where: { deleted_at: null } }
            ]
        }
    );

    HorseCheck.associate = (models) => {
        HorseCheck.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        HorseCheck.belongsTo(models.Horse, { foreignKey: 'horse_id', as: 'horse' });
        HorseCheck.belongsTo(models.Jockey, { foreignKey: 'jockey_id', as: 'jockey' });
        HorseCheck.belongsTo(models.RaceReferee, { foreignKey: 'referee_id', as: 'referee' });
        HorseCheck.belongsTo(models.Violation, { foreignKey: 'linked_violation_id', as: 'linked_violation' });
        HorseCheck.hasMany(models.HorseCheckIssue, { foreignKey: 'horse_check_id', as: 'issues' });
    };

    return HorseCheck;
};