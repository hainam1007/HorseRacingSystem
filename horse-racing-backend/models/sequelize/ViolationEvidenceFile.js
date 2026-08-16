'use strict';

/**
 * Sequelize model — `violation_evidence_files` table.
 */

module.exports = (sequelize, DataTypes) => {
    const ViolationEvidenceFile = sequelize.define(
        'violation_evidence_files',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            violation_id: { type: DataTypes.UUID, allowNull: false },
            url: { type: DataTypes.STRING(512), allowNull: false },
            public_id: { type: DataTypes.STRING(255) },
            file_type: { type: DataTypes.STRING(64) },
            file_name: { type: DataTypes.STRING(255) }
        },
        { tableName: 'violation_evidence_files', timestamps: false }
    );

    ViolationEvidenceFile.associate = (models) => {
        ViolationEvidenceFile.belongsTo(models.Violation, { foreignKey: 'violation_id', as: 'violation' });
    };

    return ViolationEvidenceFile;
};