const mongoose = require('mongoose');

const businessExpenseSchema = new mongoose.Schema({
    titulo: { type: String, required: true, trim: true },
    descripcion: { type: String, trim: true, default: '' },
    categoria: {
        type: String,
        required: true,
        enum: ['nomina', 'arriendo', 'servicios_publicos', 'marketing', 'tecnologia', 'inventario', 'logistica', 'impuestos', 'mantenimiento', 'otros'],
        index: true,
    },
    monto: { type: Number, required: true, min: 0, index: true },
    fecha: { type: Date, required: true, default: Date.now, index: true },
    proveedor: { type: String, trim: true, default: '' },
    estadoPago: {
        type: String,
        enum: ['pagado', 'pendiente', 'parcial'],
        default: 'pagado',
        index: true,
    },
    factura: { type: String, trim: true, default: '' },
    usuario: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
}, { timestamps: true });

businessExpenseSchema.index({ fecha: -1, categoria: 1 });
businessExpenseSchema.index({ estadoPago: 1, fecha: -1 });

const BusinessExpense = mongoose.model('BusinessExpense', businessExpenseSchema);
module.exports = BusinessExpense;
