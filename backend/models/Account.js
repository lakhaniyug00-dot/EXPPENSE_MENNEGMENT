const mongoose = require('mongoose');

const txSchema = new mongoose.Schema({
  id:     String,
  date:   String,
  type:   { type: String, enum: ['credit', 'debit'] },
  amount: { type: Number, default: 0 },
  note:   String,
  ref:    String,
}, { _id: false });

const accountSchema = new mongoose.Schema({
  id:           String,
  name:         { type: String, required: true, unique: true },
  transactions: [txSchema],
}, { timestamps: true });

module.exports = mongoose.model('Account', accountSchema);
