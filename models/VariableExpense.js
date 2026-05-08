const mongoose = require('mongoose');

const variableExpenseSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    monto: { type: Number, required: true, min: 0, index: true },
    fecha: { type: Date, required: true, default: Date.now, index: true },
    nota: { type: String, trim: true, default: '' },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });

variableExpenseSchema.index({ fecha: -1 });

const VariableExpense = mongoose.model('VariableExpense', variableExpenseSchema);
module.exports = VariableExpense;
