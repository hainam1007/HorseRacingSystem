-- Use the English product name for the Phu Tho track in existing databases.

UPDATE racetracks
SET name = 'Phu Tho Racetrack',
    updated_at = NOW()
WHERE code = 'PHU_THO';

-- Races mirror the racetrack name in location for legacy API consumers.
UPDATE races AS race
SET location = 'Phu Tho Racetrack'
FROM racetracks AS racetrack
WHERE race.racetrack_id = racetrack.id
  AND racetrack.code = 'PHU_THO';
