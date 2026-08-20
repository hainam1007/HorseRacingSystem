-- Standardize the remaining racetrack display names to English.

WITH renamed(code, name) AS (
    VALUES
        ('THIEN_MA', 'Thien Ma Racetrack'),
        ('QUAN_NGUA', 'Quan Ngua Racetrack'),
        ('SOC_SON', 'Soc Son Racetrack')
)
UPDATE racetracks AS racetrack
SET name = renamed.name,
    updated_at = NOW()
FROM renamed
WHERE racetrack.code = renamed.code;

WITH renamed(code, name) AS (
    VALUES
        ('THIEN_MA', 'Thien Ma Racetrack'),
        ('QUAN_NGUA', 'Quan Ngua Racetrack'),
        ('SOC_SON', 'Soc Son Racetrack')
)
UPDATE races AS race
SET location = renamed.name
FROM racetracks AS racetrack
JOIN renamed ON renamed.code = racetrack.code
WHERE race.racetrack_id = racetrack.id;
