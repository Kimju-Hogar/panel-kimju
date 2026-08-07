const PersonalExpense = require('../models/PersonalExpense');
const BusinessExpense = require('../models/BusinessExpense');
const VariableExpense = require('../models/VariableExpense');
const Debt = require('../models/Debt');
const Loan = require('../models/Loan');
const Sale = require('../models/Sale');

// ─── Helpers ─────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const buildMonthMap = (monthsBack = 12) => {
    const now = new Date();
    const map = {};
    for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
        map[key] = {
            mes: MONTH_NAMES[d.getMonth()],
            año: d.getFullYear(),
            ingresos: 0,
            gastosNegocio: 0,
            gastosPersonales: 0,
            gastosVariables: 0,
        };
    }
    return map;
};

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
        for (let i = 5; i >= 0; i--) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const key = `${d.getFullYear()}-${d.getMonth() + 1}`;
            monthsMap[key] = { mes: MONTH_NAMES[d.getMonth()], personal: 0, negocio: 0, variable: 0 };
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

// @desc  Unified business report — Sales + All Expenses + Debts/Loans
// @route GET /api/finance/reportes-unificados
const getReportesUnificados = async (req, res) => {
    try {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const startOf12Months = new Date(now.getFullYear(), now.getMonth() - 11, 1);

        // ─── Run all aggregations in parallel ───────────────────────────────────
        const [
            // Sales / Ingresos
            salesTotal,
            salesThisMonth,
            salesByMonth,
            salesByChannel,

            // Gastos Negocio
            negocioTotal,
            negocioThisMonth,
            negocioByMonth,
            negocioByCategoria,

            // Gastos Variables
            variableTotal,
            variableThisMonth,
            variableByMonth,

            // Gastos Personales (incluidos en total)
            personalTotal,
            personalThisMonth,
            personalByMonth,
            personalByCategoria,

            // Deudas activas
            deudasActivas,
            deudasProximas,

            // Préstamos activos
            prestamosActivos,
            prestamosProximos,
        ] = await Promise.all([
            // ── Sales ──
            Sale.aggregate([
                { $group: { _id: null, totalIngresos: { $sum: '$totalAmount' }, totalGanancia: { $sum: '$totalProfit' }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { date: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, totalIngresos: { $sum: '$totalAmount' }, totalGanancia: { $sum: '$totalProfit' }, count: { $sum: 1 } } },
            ]),
            Sale.aggregate([
                { $match: { date: { $gte: startOf12Months } } },
                { $group: { _id: { year: { $year: '$date' }, month: { $month: '$date' } }, ingresos: { $sum: '$totalAmount' }, ganancia: { $sum: '$totalProfit' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
            Sale.aggregate([
                { $group: { _id: '$channel', total: { $sum: '$totalAmount' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
            ]),

            // ── Gastos Negocio ──
            BusinessExpense.aggregate([
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            BusinessExpense.aggregate([
                { $match: { fecha: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            BusinessExpense.aggregate([
                { $match: { fecha: { $gte: startOf12Months } } },
                { $group: { _id: { year: { $year: '$fecha' }, month: { $month: '$fecha' } }, total: { $sum: '$monto' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
            BusinessExpense.aggregate([
                { $group: { _id: '$categoria', total: { $sum: '$monto' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
            ]),

            // ── Gastos Variables ──
            VariableExpense.aggregate([
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            VariableExpense.aggregate([
                { $match: { fecha: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            VariableExpense.aggregate([
                { $match: { fecha: { $gte: startOf12Months } } },
                { $group: { _id: { year: { $year: '$fecha' }, month: { $month: '$fecha' } }, total: { $sum: '$monto' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),

            // ── Gastos Personales ──
            PersonalExpense.aggregate([
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            PersonalExpense.aggregate([
                { $match: { fecha: { $gte: startOfMonth, $lte: endOfMonth } } },
                { $group: { _id: null, total: { $sum: '$monto' } } },
            ]),
            PersonalExpense.aggregate([
                { $match: { fecha: { $gte: startOf12Months } } },
                { $group: { _id: { year: { $year: '$fecha' }, month: { $month: '$fecha' } }, total: { $sum: '$monto' } } },
                { $sort: { '_id.year': 1, '_id.month': 1 } },
            ]),
            PersonalExpense.aggregate([
                { $group: { _id: '$categoria', total: { $sum: '$monto' }, count: { $sum: 1 } } },
                { $sort: { total: -1 } },
            ]),

            // ── Deudas ──
            Debt.aggregate([
                { $match: { estado: { $in: ['activa', 'parcial'] } } },
                { $group: { _id: null, total: { $sum: '$saldoPendiente' }, count: { $sum: 1 } } },
            ]),
            Debt.aggregate([
                { $match: { estado: { $in: ['activa', 'parcial'] } } },
                { $unwind: '$cuotas' },
                { $match: { 'cuotas.pagado': false, 'cuotas.fechaVencimiento': { $gte: now, $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } } },
                { $project: { personaEntidad: 1, monto: '$cuotas.monto', fechaVencimiento: '$cuotas.fechaVencimiento', numero: '$cuotas.numero' } },
                { $sort: { fechaVencimiento: 1 } },
                { $limit: 10 },
            ]),

            // ── Préstamos ──
            Loan.aggregate([
                { $match: { estado: { $in: ['activo', 'parcial'] } } },
                { $group: { _id: null, total: { $sum: '$saldoPendiente' }, count: { $sum: 1 } } },
            ]),
            Loan.aggregate([
                { $match: { estado: { $in: ['activo', 'parcial'] } } },
                { $unwind: '$cuotas' },
                { $match: { 'cuotas.pagado': false, 'cuotas.fechaVencimiento': { $gte: now, $lte: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) } } },
                { $project: { persona: 1, monto: '$cuotas.monto', fechaVencimiento: '$cuotas.fechaVencimiento', numero: '$cuotas.numero' } },
                { $sort: { fechaVencimiento: 1 } },
                { $limit: 10 },
            ]),
        ]);

        // ─── Build 12-month comparison map ──────────────────────────────────────
        const monthMap = buildMonthMap(12);

        salesByMonth.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthMap[key]) { monthMap[key].ingresos = g.ingresos; monthMap[key].ganancia = g.ganancia || 0; }
        });
        negocioByMonth.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthMap[key]) monthMap[key].gastosNegocio = g.total;
        });
        variableByMonth.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthMap[key]) monthMap[key].gastosVariables = g.total;
        });
        personalByMonth.forEach(g => {
            const key = `${g._id.year}-${g._id.month}`;
            if (monthMap[key]) monthMap[key].gastosPersonales = g.total;
        });

        // ─── Compute totals ──────────────────────────────────────────────────────
        const totIngresos = salesTotal[0]?.totalIngresos || 0;
        const totGananciaVentas = salesTotal[0]?.totalGanancia || 0;
        const totNegocio = negocioTotal[0]?.total || 0;
        const totVariable = variableTotal[0]?.total || 0;
        const totPersonal = personalTotal[0]?.total || 0;
        const totGastosNegocio = totNegocio + totVariable + totPersonal; // todos los gastos
        const utilidadNeta = totGananciaVentas - totGastosNegocio;
        const margenNeto = totIngresos > 0 ? ((utilidadNeta / totIngresos) * 100).toFixed(1) : 0;

        // Mes actual
        const mesIngresos = salesThisMonth[0]?.totalIngresos || 0;
        const mesGananciaVentas = salesThisMonth[0]?.totalGanancia || 0;
        const mesNegocio = negocioThisMonth[0]?.total || 0;
        const mesVariable = variableThisMonth[0]?.total || 0;
        const mesPersonal = personalThisMonth[0]?.total || 0;
        const mesGastosTotales = mesNegocio + mesVariable + mesPersonal;
        const mesUtilidadNeta = mesGananciaVentas - mesGastosTotales;

        res.json({
            kpis: {
                // Ingresos (módulo de ventas)
                totalIngresos: totIngresos,
                totalGananciaVentas: totGananciaVentas,
                totalVentas: salesTotal[0]?.count || 0,

                // Gastos discriminados
                totalGastosNegocio: totNegocio,
                totalGastosVariables: totVariable,
                totalGastosPersonales: totPersonal,
                totalGastosTodos: totGastosNegocio,

                // Deudas y préstamos
                totalDeudas: deudasActivas[0]?.total || 0,
                totalDeudasCount: deudasActivas[0]?.count || 0,
                totalPorCobrar: prestamosActivos[0]?.total || 0,
                totalPorCobrarCount: prestamosActivos[0]?.count || 0,

                // Utilidad real
                utilidadNeta,
                margenNeto: parseFloat(margenNeto),

                // Mes actual
                mesActual: {
                    ingresos: mesIngresos,
                    gananciaVentas: mesGananciaVentas,
                    gastosNegocio: mesNegocio,
                    gastosVariables: mesVariable,
                    gastosPersonales: mesPersonal,
                    gastosTotales: mesGastosTotales,
                    utilidadNeta: mesUtilidadNeta,
                    ventasCount: salesThisMonth[0]?.count || 0,
                },
            },
            graficas: {
                comparativaMensual: Object.values(monthMap),
                negocioByCategoria: negocioByCategoria.map(c => ({ name: c._id, value: c.total, count: c.count })),
                personalByCategoria: personalByCategoria.map(c => ({ name: c._id, value: c.total, count: c.count })),
                ventasByCanal: salesByChannel.map(c => ({ name: c._id || 'Otro', value: c.total, count: c.count })),
            },
            proximasObligaciones: {
                deudasProximas,
                prestamosProximos,
            },
        });
    } catch (error) {
        console.error('getReportesUnificados error:', error);
        res.status(500).json({ message: error.message });
    }
};

module.exports = { getFinanceDashboard, getFinanceStats, getReportesUnificados };
