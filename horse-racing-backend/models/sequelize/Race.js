'use strict';

/**
 * Sequelize model — `races` table.
 * Embedded `betting_market{}` → JSONB; `prize_distribution[]` → child table.
 */

module.exports = (sequelize, DataTypes) => {
    const Race = sequelize.define(
        'races',
        {
            id: {
                type: DataTypes.UUID,
                primaryKey: true,
                defaultValue: sequelize.literal('gen_random_uuid()')
            },
            tournament_id: { type: DataTypes.UUID, allowNull: false },
            round_id: { type: DataTypes.UUID, allowNull: false },
            name: { type: DataTypes.STRING(255), allowNull: false },
            image_url: { type: DataTypes.STRING(512) },
            image_public_id: { type: DataTypes.STRING(255) },
            race_no: { type: DataTypes.INTEGER, defaultValue: 1, validate: { min: 1 } },
            race_date: { type: DataTypes.DATE },
            distance: { type: DataTypes.INTEGER },
            max_participants: { type: DataTypes.INTEGER },
            location: { type: DataTypes.STRING(255) },
            venue_code: { type: DataTypes.STRING(64) },
            racetrack_id: { type: DataTypes.UUID },
            eligibility_rule_snapshot: { type: DataTypes.JSONB },
            course: {
                type: DataTypes.STRING(8),
                defaultValue: 'B+2',
                validate: { isIn: [['A', 'A+3', 'B', 'B+2', 'C', 'C+3']] }
            },
            race_class: {
                type: DataTypes.STRING(8),
                defaultValue: '5',
                validate: { isIn: [['1', '2', '3', '4', '5']] }
            },
            going: {
                type: DataTypes.STRING(32),
                defaultValue: 'Good',
                validate: { isIn: [['Fast', 'Good', 'Good To Firm', 'Good To Yielding', 'Wet Slow', 'Yielding']] }
            },
            surface: {
                type: DataTypes.STRING(32),
                defaultValue: 'Turf',
                validate: { isIn: [['Turf', 'Dirt', 'Synthetic']] }
            },
            referee_id: { type: DataTypes.UUID },
            registration_lock_at: { type: DataTypes.DATE },
            registration_locked: { type: DataTypes.BOOLEAN, defaultValue: false },
            registration_slot_count: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
            registration_slots_initialized: { type: DataTypes.BOOLEAN, defaultValue: false },
            entries_finalized_at: { type: DataTypes.DATE },
            entries_finalized_by: { type: DataTypes.UUID },
            model_input_version: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
            status: { type: DataTypes.STRING(32), defaultValue: 'scheduled' },
            starting_at: { type: DataTypes.DATE },
            started_at: { type: DataTypes.DATE },
            assignment_revision: { type: DataTypes.INTEGER, defaultValue: 0, validate: { min: 0 } },
            betting_status: { type: DataTypes.STRING(32), defaultValue: 'unavailable' },
            betting_closes_at: { type: DataTypes.DATE },
            betting_market: { type: DataTypes.JSONB, defaultValue: {} },
            entry_fee: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, validate: { min: 0 } },
            entry_fee_currency: { type: DataTypes.STRING(8), defaultValue: 'VND' },
            prize_pool: { type: DataTypes.DECIMAL(15, 2), defaultValue: 0, validate: { min: 0 } },
            prize_currency: { type: DataTypes.STRING(8), defaultValue: 'VND' }
        },
        { tableName: 'races' }
    );

    Race.associate = (models) => {
        Race.belongsTo(models.Tournament, { foreignKey: 'tournament_id', as: 'tournament' });
        Race.belongsTo(models.Round, { foreignKey: 'round_id', as: 'round' });
        Race.belongsTo(models.Racetrack, { foreignKey: 'racetrack_id', as: 'racetrack' });
        Race.belongsTo(models.RaceReferee, { foreignKey: 'referee_id', as: 'referee' });
        Race.belongsTo(models.User, { foreignKey: 'entries_finalized_by', as: 'entries_finalizer' });
        Race.hasMany(models.RacePrizeDistributionItem, { foreignKey: 'race_id', as: 'prize_distribution' });
        Race.hasMany(models.Registration, { foreignKey: 'race_id', as: 'registrations' });
        Race.hasMany(models.JockeyAssignment, { foreignKey: 'race_id', as: 'jockey_assignments' });
        Race.hasMany(models.HorseCheck, { foreignKey: 'race_id', as: 'horse_checks' });
        Race.hasMany(models.RaceResult, { foreignKey: 'race_id', as: 'race_results' });
        Race.hasMany(models.Prize, { foreignKey: 'race_id', as: 'prizes' });
        Race.hasMany(models.Bet, { foreignKey: 'race_id', as: 'bets' });
        Race.hasMany(models.RefereeReport, { foreignKey: 'race_id', as: 'referee_reports' });
        Race.hasMany(models.Violation, { foreignKey: 'race_id', as: 'violations' });
        Race.hasMany(models.RegistrationCancellationTicket, { foreignKey: 'race_id', as: 'cancellation_tickets' });
        Race.hasOne(models.RaceEngineRun, { foreignKey: 'race_id', as: 'engine_run' });
        Race.hasOne(models.RaceRun, { foreignKey: 'race_id', as: 'race_run' });
        Race.hasOne(models.RaceOddsMarket, { foreignKey: 'race_id', as: 'odds_market' });
        Race.hasMany(models.HorseRatingHistory, { foreignKey: 'race_id', as: 'rating_history' });
    };

    return Race;
};
