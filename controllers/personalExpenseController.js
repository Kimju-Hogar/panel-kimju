const PersonalExpense = require('../models/PersonalExpense');

// @desc  Get all personal expenses (paginated)
// @route GET /api/finance/gastos-personales
const getPersonalExpenses = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.categoria) filter.categoria = req.query.categoria;
        if (req.query.desde) filter.fecha = { ...filter.fecha, $gte: new Date(req.query.desde) };
        if (req.query.hasta) filter.fecha = { ...filter.fecha, $lte: new Date(req.query.hasta) };
        if (req.query.search) filter.titulo = { $regex: req.query.search, $options: 'i' };

        const [data, total] = await Promise.all([
            PersonalExpense.find(filter).sort({ fecha: -1 }).skip(skip).limit(limit).lean(),
            PersonalExpense.countDocuments(filter),
        ]);

        res.json({ data, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc  Create personal expense
// @route POST /api/finance/gastos-personales
const createPersonalExpense = async (req, res) => {
    try {
        const expense = await PersonalExpense.create(req.body);
        res.status(201).json(expense);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc  Update personal expense
// @route PUT /api/finance/gastos-personales/:id
const updatePersonalExpense = async (req, res) => {
    try {
        const expense = await PersonalExpense.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
        if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
        res.json(expense);
    } catch (error) {
        res.status(400).json({ message: error.message });
    }
};

// @desc  Delete personal expense
// @route DELETE /api/finance/gastos-personales/:id
const deletePersonalExpense = async (req, res) => {
    try {
        const expense = await PersonalExpense.findByIdAndDelete(req.params.id);
        if (!expense) return res.status(404).json({ message: 'Gasto no encontrado' });
        res.json({ message: 'Gasto eliminado' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getPersonalExpenses, createPersonalExpense, updatePersonalExpense, deletePersonalExpense };
