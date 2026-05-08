const mongoose = require('mongoose');

const cuotaSchema = new mongoose.Schema({
    numero: { type: Number, required: true },
    monto: { type: Number, required: true },
    fechaVencimiento: { type: Date, required: true },
    pagado: { type: Boolean, default: false },
    fechaPago: { type: Date },
}, { _id: false });

const debtSchema = new mongoose.Schema({
    personaEntidad: { type: String, required: true, trim: true, index: true },
    descripcion: { type: String, trim: true, default: '' },
    montoTotal: { type: Number, required: true, min: 0, index: true },
    saldoPendiente: { type: Number, required: true, min: 0 },
    cuotas: [cuotaSchema],
    fechaInicio: { type: Date, required: true, default: Date.now, index: true },
    fechaLimite: { type: Date, index: true },
    estado: {
        type: String,
        enum: ['activa', 'parcial', 'pagada'],
        default: 'activa',
        index: true,
    },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });

debtSchema.index({ estado: 1, fechaLimite: 1 });

const Debt = mongoose.model('Debt', debtSchema);
module.exports = Debt;
