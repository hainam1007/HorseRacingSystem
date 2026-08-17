BEGIN;

ALTER TABLE race_odds_market_odds
    ADD COLUMN IF NOT EXISTS opening_game_odds NUMERIC(8,2);

UPDATE race_odds_market_odds
SET opening_game_odds = game_odds
WHERE opening_game_odds IS NULL;

ALTER TABLE race_odds_market_odds
    DROP CONSTRAINT IF EXISTS race_odds_market_odds_opening_game_odds_check;

ALTER TABLE race_odds_market_odds
    ADD CONSTRAINT race_odds_market_odds_opening_game_odds_check
    CHECK (opening_game_odds IS NULL OR opening_game_odds >= 1);

COMMIT;
