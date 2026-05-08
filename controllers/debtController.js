const Debt = require('../models/Debt');

const getDebts = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.estado) filter.estado = req.query.estado;
        if (req.query.search) filter.personaEntidad = { $regex: req.query.search, $options: 'i' };

        const [data, total] = await Promise.all([
            Debt.find(filter).sort({ fechaInicio: -1 }).skip(skip).limit(limit).lean(),
            Debt.countDocuments(filter),
        ]);

        res.json({ data, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createDebt = async (req, res) => {
    try {
        const body = { ...req.body, saldoPendiente: req.body.montoTotal };
        const debt = await Debt.create(body);
        res.status(201).json(debt);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateDebt = async (req, res) => {
    try {
        const debt = await Debt.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!debt) return res.status(404).json({ message: 'Deuda no encontrada' });
        res.json(debt);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteDebt = async (req, res) => {
    try {
        const debt = await Debt.findByIdAndDelete(req.params.id);
        if (!debt) return res.status(404).json({ message: 'Deuda no encontrada' });
        res.json({ message: 'Deuda eliminada' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Pay a cuota
const payCuota = async (req, res) => {
    try {
        const debt = await Debt.findById(req.params.id);
        if (!debt) return res.status(404).json({ message: 'Deuda no encontrada' });

        const cuotaIndex = debt.cuotas.findIndex((c, i) => i === parseInt(req.params.cuotaIndex));
        if (cuotaIndex === -1) return res.status(404).json({ message: 'Cuota no encontrada' });

        debt.cuotas[cuotaIndex].pagado = true;
        debt.cuotas[cuotaIndex].fechaPago = new Date();

        // Recalculate saldoPendiente
        const totalPagado = debt.cuotas.filter(c => c.pagado).reduce((sum, c) => sum + c.monto, 0);
        debt.saldoPendiente = Math.max(0, debt.montoTotal - totalPagado);

        if (debt.saldoPendiente === 0) debt.estado = 'pagada';
        else if (totalPagado > 0) debt.estado = 'parcial';

        await debt.save();
        res.json(debt);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getDebts, createDebt, updateDebt, deleteDebt, payCuota };
