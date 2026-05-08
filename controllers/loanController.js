const Loan = require('../models/Loan');

const getLoans = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.estado) filter.estado = req.query.estado;
        if (req.query.search) filter.persona = { $regex: req.query.search, $options: 'i' };

        const [data, total] = await Promise.all([
            Loan.find(filter).sort({ fecha: -1 }).skip(skip).limit(limit).lean(),
            Loan.countDocuments(filter),
        ]);

        res.json({ data, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createLoan = async (req, res) => {
    try {
        const body = { ...req.body, saldoPendiente: req.body.montoPrestado };
        const loan = await Loan.create(body);
        res.status(201).json(loan);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateLoan = async (req, res) => {
    try {
        const loan = await Loan.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!loan) return res.status(404).json({ message: 'Préstamo no encontrado' });
        res.json(loan);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteLoan = async (req, res) => {
    try {
        const loan = await Loan.findByIdAndDelete(req.params.id);
        if (!loan) return res.status(404).json({ message: 'Préstamo no encontrado' });
        res.json({ message: 'Préstamo eliminado' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// Register a cuota payment received
const receiveCuota = async (req, res) => {
    try {
        const loan = await Loan.findById(req.params.id);
        if (!loan) return res.status(404).json({ message: 'Préstamo no encontrado' });

        const cuotaIndex = parseInt(req.params.cuotaIndex);
        if (cuotaIndex < 0 || cuotaIndex >= loan.cuotas.length) return res.status(404).json({ message: 'Cuota no encontrada' });

        loan.cuotas[cuotaIndex].pagado = true;
        loan.cuotas[cuotaIndex].fechaPago = new Date();

        const totalCobrado = loan.cuotas.filter(c => c.pagado).reduce((sum, c) => sum + c.monto, 0);
        loan.saldoPendiente = Math.max(0, loan.montoPrestado - totalCobrado);

        if (loan.saldoPendiente === 0) loan.estado = 'cobrado';
        else if (totalCobrado > 0) loan.estado = 'parcial';

        await loan.save();
        res.json(loan);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getLoans, createLoan, updateLoan, deleteLoan, receiveCuota };
