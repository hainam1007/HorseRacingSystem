const RACE_COURSES = ['A', 'A+3', 'B', 'B+2', 'C', 'C+3'];
const RACE_CLASSES = ['1', '2', '3', '4', '5'];
const RACE_GOINGS = [
  'Fast',
  'Good',
  'Good To Firm',
  'Good To Yielding',
  'Wet Slow',
  'Yielding'
];
const RACE_SURFACES = ['Turf', 'Dirt', 'Synthetic'];
const HORSE_GEAR_CODES = ['B', 'BO', 'V', 'TT', 'CP', 'CO', 'H', 'P', 'PC', 'PS', 'SR', 'SB', 'E', 'XB', 'CC'];

const MODEL_INPUT_DEFAULTS = {
  COURSE: 'B+2',
  RACE_CLASS: '5',
  GOING: 'Good',
  SURFACE: 'Turf',
  HORSE_RATING: 50,
  DECLARED_WEIGHT_KG: 54.5
};

module.exports = {
  HORSE_GEAR_CODES,
  MODEL_INPUT_DEFAULTS,
  RACE_CLASSES,
  RACE_COURSES,
  RACE_GOINGS,
  RACE_SURFACES
};
