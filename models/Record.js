// models/Record.js
const mongoose = require('mongoose');

const RecordSchema = new mongoose.Schema({
  id: { type: Number, required: true, unique: true },
  name: { type: String, required: true },
  created: { type: Date, default: Date.now },
  modified: { type: Date, default: Date.now }
});

// update `modified` automatically on save
RecordSchema.pre('save', function(next) {
  this.modified = new Date();
  next();
});

module.exports = mongoose.model('Record', RecordSchema);

