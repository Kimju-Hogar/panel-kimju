const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');

// Rate limit: 120 req/min per IP for finance endpoints
const financeLimit = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Demasiadas solicitudes, intenta más tarde.' },
});

router.use(financeLimit);


const { getFinanceDashboard, getFinanceStats } = require('../controllers/financeController');
const { getPersonalExpenses, createPersonalExpense, updatePersonalExpense, deletePersonalExpense } = require('../controllers/personalExpenseController');
const { getBusinessExpenses, createBusinessExpense, updateBusinessExpense, deleteBusinessExpense } = require('../controllers/businessExpenseController');
const { getVariableExpenses, createVariableExpense, updateVariableExpense, deleteVariableExpense } = require('../controllers/variableExpenseController');
const { getDebts, createDebt, updateDebt, deleteDebt, payCuota } = require('../controllers/debtController');
const { getLoans, createLoan, updateLoan, deleteLoan, receiveCuota } = require('../controllers/loanController');

// Dashboard & Stats
router.get('/dashboard', getFinanceDashboard);
router.get('/estadisticas', getFinanceStats);

// Gastos Personales
router.route('/gastos-personales')
    .get(getPersonalExpenses)
    .post(createPersonalExpense);
router.route('/gastos-personales/:id')
    .put(updatePersonalExpense)
    .delete(deletePersonalExpense);

// Gastos Negocio
router.route('/gastos-negocio')
    .get(getBusinessExpenses)
    .post(createBusinessExpense);
router.route('/gastos-negocio/:id')
    .put(updateBusinessExpense)
    .delete(deleteBusinessExpense);

// Gastos Variables
router.route('/gastos-variables')
    .get(getVariableExpenses)
    .post(createVariableExpense);
router.route('/gastos-variables/:id')
    .put(updateVariableExpense)
    .delete(deleteVariableExpense);

// Deudas (lo que debemos)
router.route('/deudas')
    .get(getDebts)
    .post(createDebt);
router.route('/deudas/:id')
    .put(updateDebt)
    .delete(deleteDebt);
router.patch('/deudas/:id/cuotas/:cuotaIndex/pagar', payCuota);

// Préstamos (lo que nos deben)
router.route('/prestamos')
    .get(getLoans)
    .post(createLoan);
router.route('/prestamos/:id')
    .put(updateLoan)
    .delete(deleteLoan);
router.patch('/prestamos/:id/cuotas/:cuotaIndex/cobrar', receiveCuota);

module.exports = router;
