const PersonalExpense = require('../models/PersonalExpense');
const BusinessExpense = require('../models/BusinessExpense');
const VariableExpense = require('../models/VariableExpense');
const Debt = require('../models/Debt');
const Loan = require('../models/Loan');

// @desc  Finance dashboard summary
// @route GET /api/finance/dashboard
const getFinanceDashboard = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const [
            totalPersonal, totalNegocio, totalVariable,
            deudas, prestamos,
            personalMes, negocioMes, variableMes,
            personalPorCategoria, negocioPorCategoria,
            gastosMensuales,
        ] = await Promise.all([
            PersonalExpense.aggregate([{ $group: { _id: null, total: { $sum: '$monto' } } }]),
            BusinessExpense.aggregate([{ $group: { _id: null, total: { $sum: '$monto' } } }]),
            VariableExpense.aggregate([{ $group: { _id: null, total: { $sum: '$monto' } } }]),
            Debt.aggregate([
                { $match: { estado: { $in: ['activa', 'parcial'] } } },
                { $group: { _id: null, total: { $sum: '$saldoPendiente' }, count: { $sum: 1 } } },
            ]),
            Loan.aggregate([
                { $match: { estado: { $in: ['activo', 'parcial'] } } },
                { $group: { _id: null, total: { $sum: '$saldoPendiente' }, count: { $sum: 1 } } },
            ]),
            // Mes actual
            PersonalExpense.aggregate([
                { $match: { fecha: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            BusinessExpense.aggregate([
                { $match: { fecha: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            VariableExpense.aggregate([
                { $match: { fecha: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            // Por categoría (todos los tiempos)
            PersonalExpense.aggregate([
                { $group: { _id: '$categoria', total: { $sum: '$monto' } } },
                { $sort: { total: -1 } },
            ]),
            BusinessExpense.aggregate([
                { $group: { _id: '$categoria', total: { $sum: '$monto' } } },
                { $sort: { total: -1 } },
            ]),
            // Gastos últimos 6 meses (combinados)
            PersonalExpense.aggregate([
                { $match: { fecha: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
                {
                    $group: {
                        _id: { year: { $year: '$fecha' }, month: { $month: '$fecha' } },
                        personal: { $sum: '$monto' },
                    },
                },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
        ]);

        // Gastos variables y negocios por mes (últimos 6)
        const [negocioMensual, variableMensual] = await Promise.all([
            BusinessExpense.aggregate([
                { $match: { fecha: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
                { $group: { _id: { year: { $year: '$fecha' }, month: { $month: '$fecha' } }, negocio: { $sum: '$monto' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
            VariableExpense.aggregate([
                { $match: { fecha: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
                { $group: { _id: { year: { $year: '$fecha' }, month: { $month: '$fecha' } }, variable: { $sum: '$monto' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
        ]);

        // Merge monthly data
        const monthsMap = {};
        const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            monthsMap[key] = { mes: monthNames[d.getMonth()], personal: 0, negocio: 0, variable: 0 };
        }

        gastosMensuales.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthsMap[key]) monthsMap[key].personal = g.personal;
        });
        negocioMensual.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthsMap[key]) monthsMap[key].negocio = g.negocio;
        });
        variableMensual.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthsMap[key]) monthsMap[key].variable = g.variable;
        });

        const totPersonal = totalPersonal[0]?.total || 0;
        const totNegocio = totalNegocio[0]?.total || 0;
        const totVariable = totalVariable[0]?.total || 0;

        res.json({
            resumen: {
                totalPersonal: totPersonal,
                totalNegocio: totNegocio,
                totalVariable: totVariable,
                totalDineroSalido: totPersonal + totNegocio + totVariable,
                totalDeudas: deudas[0]?.total || 0,
                totalDeudasCount: deudas[0]?.count || 0,
                totalPorCobrar: prestamos[0]?.total || 0,
                totalPrestamosCount: prestamos[0]?.count || 0,
                mesActual: {
                    personal: personalMes[0]?.total || 0,
                    negocio: negocioMes[0]?.total || 0,
                    variable: variableMes[0]?.total || 0,
                },
            },
            graficas: {
                gastosMensuales: Object.values(monthsMap),
                personalPorCategoria: personalPorCategoria.map(c => ({ name: c._id, value: c.total })),
                negocioPorCategoria: negocioPorCategoria.map(c => ({ name: c._id, value: c.total })),
            },
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

// @desc  Finance stats (detailed)
// @route GET /api/finance/estadisticas
const getFinanceStats = async (req, res) => {
    try {
        const year = parseInt(req.query.year) || new Date().getFullYear();

        const startYear = new Date(year, 0, 1);
        const endYear = new Date(year, 11, 31, 23, 59, 59);

        const [personal, negocio, variable] = await Promise.all([
            PersonalExpense.aggregate([
                { $match: { fecha: { $gte: startYear, $lte: endYear } } },
                { $group: { _id: { month: { $month: '$fecha' }, categoria: '$categoria' }, total: { $sum: '$monto' } } },
                { $sort: { '_id.month': 1 } },
            ]),
            BusinessExpense.aggregate([
                { $match: { fecha: { $gte: startYear, $lte: endYear } } },
                { $group: { _id: { month: { $month: '$fecha' }, categoria: '$categoria' }, total: { $sum: '$monto' } } },
                { $sort: { '_id.month': 1 } },
            ]),
            VariableExpense.aggregate([
                { $match: { fecha: { $gte: startYear, $lte: endYear } } },
                { $group: { _id: { month: { $month: '$fecha' } }, total: { $sum: '$monto' } } },
                { $sort: { '_id.month': 1 } },
            ]),
        ]);

        res.json({ year, personal, negocio, variable });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getFinanceDashboard, getFinanceStats };
