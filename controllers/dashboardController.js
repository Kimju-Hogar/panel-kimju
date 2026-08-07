const Sale = require('../models/Sale');
const Product = require('../models/Product');
const BusinessExpense = require('../models/BusinessExpense');
const PersonalExpense = require('../models/PersonalExpense');
const VariableExpense = require('../models/VariableExpense');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const { type, startDate, endDate } = req.query; // 'hogar', 'calzado', or undefined/'all'

        const isFiltered = type && type !== 'all';
        const productMatch = isFiltered ? { "productDetails.type": type } : {};
        const stockMatch = isFiltered ? { type } : {};

        let dateMatch = {};
        if (startDate || endDate) {
            dateMatch.date = {};
            if (startDate) dateMatch.date.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                dateMatch.date.$lte = end;
            }
        }

        let expenseDateMatch = {};
        if (startDate || endDate) {
            expenseDateMatch.fecha = {};
            if (startDate) expenseDateMatch.fecha.$gte = new Date(startDate);
            if (endDate) {
                const end = new Date(endDate);
                end.setHours(23, 59, 59, 999);
                expenseDateMatch.fecha.$lte = end;
            }
        }

        // ─── Build all aggregation pipelines ────────────────────────────────────

        // 1. Total Sales & Total Profit
        const salesStatsPipeline = isFiltered
            ? [
                ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),
                { $unwind: "$products" },
                { $group: { _id: "$products.product", subtotal: { $sum: "$products.subtotal" }, quantity: { $sum: "$products.quantity" }, unitCost: { $first: "$products.unitCost" } } },
                { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "productDetails" } },
                { $unwind: "$productDetails" },
                { $match: productMatch },
                { $group: { _id: null, totalSales: { $sum: "$subtotal" }, totalProfit: { $sum: { $subtract: ["$subtotal", { $multiply: ["$unitCost", "$quantity"] }] } } } }
            ]
            : [
                ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),
                { $group: { _id: null, totalSales: { $sum: "$totalAmount" }, totalProfit: { $sum: "$totalProfit" } } }
            ];

        // 2. Stock Value & Low Stock Count
        const productsStatsPipeline = [
            { $match: stockMatch },
            { $project: { stockValue: { $multiply: ["$costPrice", "$stock"] }, isLowStock: { $lt: ["$stock", "$minStock"] } } },
            { $group: { _id: null, totalStockValue: { $sum: "$stockValue" }, lowStockCount: { $sum: { $cond: ["$isLowStock", 1, 0] } } } }
        ];

        // 3. Recent Activity (Last 5 Sales)
        let recentActivityQuery;
        if (!isFiltered) {
            recentActivityQuery = Sale.find(dateMatch)
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('customer', 'name')
                .select('totalAmount date channel customer products')
                .lean();
        } else {
            recentActivityQuery = Sale.aggregate([
                ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),
                { $sort: { createdAt: -1 } },
                { $limit: 50 },
                { $unwind: "$products" },
                { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
                { $unwind: "$productDetails" },
                { $match: productMatch },
                { $group: { _id: "$_id", date: { $first: "$date" }, channel: { $first: "$channel" }, customer: { $first: "$customer" }, totalAmount: { $sum: "$products.subtotal" } } },
                { $sort: { date: -1 } },
                { $limit: 5 },
                { $lookup: { from: "customers", localField: "customer", foreignField: "_id", as: "customerData" } },
                { $addFields: { customer: { $arrayElemAt: ["$customerData", 0] } } },
                { $project: { customerData: 0 } }
            ]);
        }

        // 4. Sales Trend (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const trendPipeline = isFiltered
            ? [
                { $match: { date: { $gte: sevenDaysAgo } } },
                { $unwind: "$products" },
                { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
                { $unwind: "$productDetails" },
                { $match: productMatch },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, sales: { $sum: "$products.subtotal" } } },
                { $sort: { _id: 1 } }
            ]
            : [
                { $match: { date: { $gte: sevenDaysAgo } } },
                { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } }, sales: { $sum: "$totalAmount" } } },
                { $sort: { _id: 1 } }
            ];

        // 5. Sales by Payment Method
        const paymentPipeline = isFiltered
            ? [
                ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),
                { $unwind: "$products" },
                { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
                { $unwind: "$productDetails" },
                { $match: productMatch },
                { $group: { _id: "$paymentMethod", value: { $sum: "$products.subtotal" } } }
            ]
            : [
                ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),
                { $group: { _id: "$paymentMethod", value: { $sum: "$totalAmount" } } }
            ];

        // 6. Sales by Category
        const categoryPipeline = [
            ...(Object.keys(dateMatch).length > 0 ? [{ $match: dateMatch }] : []),
            { $unwind: "$products" },
            { $group: { _id: "$products.product", subtotal: { $sum: "$products.subtotal" } } },
            { $lookup: { from: "products", localField: "_id", foreignField: "_id", as: "productDetails" } },
            { $unwind: "$productDetails" },
            ...(isFiltered ? [{ $match: productMatch }] : []),
            { $group: { _id: "$productDetails.category", value: { $sum: "$subtotal" } } }
        ];

        // ─── Execute ALL queries IN PARALLEL ────────────────────────────────────
        const [
            salesStats,
            productsStats,
            recentActivity,
            salesTrend,
            salesByPaymentMethod,
            salesByCategory,
            businessExpenseStat,
            personalExpenseStat,
            variableExpenseStat
        ] = await Promise.all([
            Sale.aggregate(salesStatsPipeline),
            Product.aggregate(productsStatsPipeline),
            recentActivityQuery,
            Sale.aggregate(trendPipeline),
            Sale.aggregate(paymentPipeline),
            Sale.aggregate(categoryPipeline),
            BusinessExpense.aggregate([
                ...(Object.keys(expenseDateMatch).length > 0 ? [{ $match: expenseDateMatch }] : []),
                { $group: { _id: null, total: { $sum: '$monto' } } }
            ]),
            PersonalExpense.aggregate([
                ...(Object.keys(expenseDateMatch).length > 0 ? [{ $match: expenseDateMatch }] : []),
                { $group: { _id: null, total: { $sum: '$monto' } } }
            ]),
            VariableExpense.aggregate([
                ...(Object.keys(expenseDateMatch).length > 0 ? [{ $match: expenseDateMatch }] : []),
                { $group: { _id: null, total: { $sum: '$monto' } } }
            ])
        ]);

        // ─── Format Results ──────────────────────────────────────────────────────
        const totalSales = salesStats.length > 0 ? salesStats[0].totalSales : 0;
        const totalSalesProfit = salesStats.length > 0 ? salesStats[0].totalProfit : 0;
        
        // Expenses
        const expensesBusiness = businessExpenseStat[0]?.total || 0;
        const expensesPersonal = personalExpenseStat[0]?.total || 0;
        const expensesVariable = variableExpenseStat[0]?.total || 0;
        const totalExpenses = expensesBusiness + expensesPersonal + expensesVariable;
        
        // Net profit
        const totalProfit = totalSalesProfit - totalExpenses;

        const stockValue = productsStats.length > 0 ? productsStats[0].totalStockValue : 0;
        const lowStockCount = productsStats.length > 0 ? productsStats[0].lowStockCount : 0;

        const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
        const formattedTrend = salesTrend.map(item => ({
            name: days[new Date(item._id).getUTCDay()],
            fullDate: item._id,
            sales: item.sales
        }));

        res.json({
            totalSales,
            totalProfit,
            totalSalesProfit,
            expensesBusiness,
            expensesPersonal,
            expensesVariable,
            totalExpenses,
            stockValue,
            lowStockCount,
            recentActivity,
            salesTrend: formattedTrend,
            salesByPaymentMethod,
            salesByCategory
        });

    } catch (error) {
        console.error("Dashboard Stats Error:", error);
        res.status(500).json({ message: "Server Error fetching dashboard stats" });
    }
};

module.exports = { getDashboardStats };
