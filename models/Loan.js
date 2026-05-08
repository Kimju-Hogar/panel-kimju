const mongoose = require('mongoose');

const cuotaLoanSchema = new mongoose.Schema({
    numero: { type: Number, required: true },
    monto: { type: Number, required: true },
    fechaVencimiento: { type: Date, required: true },
    pagado: { type: Boolean, default: false },
    fechaPago: { type: Date },
}, { _id: false });

const loanSchema = new mongoose.Schema({
    persona: { type: String, required: true, trim: true, index: true },
    descripcion: { type: String, trim: true, default: '' },
    montoPrestado: { type: Number, required: true, min: 0, index: true },
    saldoPendiente: { type: Number, required: true, min: 0 },
    cuotas: [cuotaLoanSchema],
    fecha: { type: Date, required: true, default: Date.now, index: true },
    fechaLimite: { type: Date, index: true },
    estado: {
        type: String,
        enum: ['activo', 'parcial', 'cobrado'],
        default: 'activo',
        index: true,
    },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });

loanSchema.index({ estado: 1, fechaLimite: 1 });

const Loan = mongoose.model('Loan', loanSchema);
module.exports = Loan;
