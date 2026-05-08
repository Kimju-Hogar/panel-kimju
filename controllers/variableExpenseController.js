const VariableExpense = require('../models/VariableExpense');

const getVariableExpenses = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.desde) filter.fecha = { ...filter.fecha, $gte: new Date(req.query.desde) };
        if (req.query.hasta) filter.fecha = { ...filter.fecha, $lte: new Date(req.query.hasta) };
        if (req.query.search) filter.titulo = { $regex: req.query.search, $options: 'i' };

        const [data, total] = await Promise.all([
            VariableExpense.find(filter).sort({ fecha: -1 }).skip(skip).limit(limit).lean(),
            VariableExpense.countDocuments(filter),
        ]);

        res.json({ data, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

const createVariableExpense = async (req, res) => {
    try {
        const expense = await VariableExpense.create(req.body);
        res.status(201).json(expense);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const updateVariableExpense = async (req, res) => {
    try {
        const expense = await VariableExpense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
        res.json(expense);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

const deleteVariableExpense = async (req, res) => {
    try {
        const expense = await VariableExpense.findByIdAndDelete(req.params.id);
        if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
        res.json({ message: 'Gasto eliminado' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getVariableExpenses, createVariableExpense, updateVariableExpense, deleteVariableExpense };
