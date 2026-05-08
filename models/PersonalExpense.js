const mongoose = require('mongoose');

const personalExpenseSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: '' },
    categoria: {
        type: String,
        required: true,
        enum: ['alimentacion', 'transporte', 'salud', 'entretenimiento', 'ropa', 'educacion', 'hogar', 'servicios', 'otros'],
        index: true,
    },
    monto: { type: Number, required: true, min: 0, index: true },
    fecha: { type: Date, required: true, default: Date.now, index: true },
    metodoPago: {
        type: String,
        enum: ['efectivo', 'tarjeta_debito', 'tarjeta_credito', 'transferencia', 'nequi', 'daviplata', 'otro'],
        default: 'efectivo',
    },
    observaciones: { type: String, trim: true, default: '' },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });

personalExpenseSchema.index({ fecha: -1, categoria: 1 });

const PersonalExpense = mongoose.model('PersonalExpense', personalExpenseSchema);
module.exports = PersonalExpense;
