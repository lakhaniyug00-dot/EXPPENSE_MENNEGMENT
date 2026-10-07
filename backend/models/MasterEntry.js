const mongoose = require('mongoose');

const masterEntrySchema = new mongoose.Schema({
  id: String,
  name:        { type: String, required: true, unique: true },
  category:    { type: String, default: '' },
  master:      { type: String, default: '' },
  fixedLabel:  { type: String, default: '' },
  pagarAmount: { type: String, default: '' },
  note:        { type: String, default: '' },
  amount:      { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('MasterEntry', masterEntrySchema);
