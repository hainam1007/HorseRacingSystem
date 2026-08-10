const mongoose = require('mongoose');

const { Schema } = mongoose;

const roleSchema = new Schema(
  {
    role_name: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    }
  },
  {
    collection: 'roles',
    versionKey: false
  }
);

module.exports = mongoose.model('Role', roleSchema);
