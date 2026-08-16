'use strict';

/**
 * Sequelize model — `referee_reports` table.
 */

module.exports = (sequelize, DataTypes) => {
    const RefereeReport = sequelize.define(
        'referee_reports',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            race_id: { type: DataTypes.UUID, allowNull: false },
            referee_id: { type: DataTypes.UUID, allowNull: false },
            report_title: { type: DataTypes.STRING(255), allowNull: false },
            report_content: { type: DataTypes.TEXT },
            race_condition: { type: DataTypes.STRING(64) },
            weather: { type: DataTypes.STRING(64) },
            track_condition: { type: DataTypes.STRING(64) },
            conclusion: { type: DataTypes.TEXT },
            status: { type: DataTypes.STRING(32), defaultValue: 'draft' },
            created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
            submitted_at: { type: DataTypes.DATE }
        },
        { tableName: 'referee_reports' }
    );

    RefereeReport.associate = (models) => {
        RefereeReport.belongsTo(models.Race, { foreignKey: 'race_id', as: 'race' });
        RefereeReport.belongsTo(models.RaceReferee, { foreignKey: 'referee_id', as: 'referee' });
    };

    return RefereeReport;
};