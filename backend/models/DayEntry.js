const mongoose = require('mongoose');

const entrySchema = new mongoose.Schema({
  id: String,
  name: String,
  amount: { type: Number, default: 0 },
  note: String,
  category: String,
  master: String,
  fixedLabel: String,
  pagarAmount: String,
  _type: String,
  _dateKey: String,
}, { _id: false });

const dayEntrySchema = new mongoose.Schema({
  dateKey: { type: String, required: true, unique: true },  // "YYYY-MM-DD"
  income:  [entrySchema],
  expense: [entrySchema],
}, { timestamps: true });

module.exports = mongoose.model('DayEntry', dayEntrySchema);
