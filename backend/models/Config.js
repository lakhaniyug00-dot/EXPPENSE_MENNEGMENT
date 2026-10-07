const mongoose = require('mongoose');

// Shared config (company name, categories, subcategories, workers list)
const configSchema = new mongoose.Schema({
  key:   { type: String, required: true, unique: true },
  value: mongoose.Schema.Types.Mixed,
}, { timestamps: true });

module.exports = mongoose.model('Config', configSchema);
