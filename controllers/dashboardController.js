const Sale = require('../models/Sale');
const Product = require('../models/Product');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        const { type } = req.query; // 'hogar', 'calzado', or undefined/'all'

        const isFiltered = type && type !== 'all';
        const productMatch = isFiltered ? { "productDetails.type": type } : {};
        const stockMatch = isFiltered ? { type } : {};

        // ─── Build all aggregation pipelines ────────────────────────────────────

        // 1. Total Sales & Total Profit
        const salesStatsPipeline = isFiltered
            ? [
                { $unwind: "$products" },
                { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
                { $unwind: "$productDetails" },
                { $match: productMatch },
                { $group: { _id: null, totalSales: { $sum: "$products.subtotal" }, totalProfit: { $sum: { $subtract: ["$products.subtotal", { $multiply: ["$products.unitCost", "$products.quantity"] }] } } } }
            ]
            : [{ $group: { _id: null, totalSales: { $sum: "$totalAmount" }, totalProfit: { $sum: "$totalProfit" } } }];

        // 2. Stock Value & Low Stock Count
        const productsStatsPipeline = [
            { $match: stockMatch },
            { $project: { stockValue: { $multiply: ["$costPrice", "$stock"] }, isLowStock: { $lt: ["$stock", "$minStock"] } } },
            { $group: { _id: null, totalStockValue: { $sum: "$stockValue" }, lowStockCount: { $sum: { $cond: ["$isLowStock", 1, 0] } } } }
        ];

        // 3. Recent Activity (Last 5 Sales)
        let recentActivityQuery;
        if (!isFiltered) {
            recentActivityQuery = Sale.find()
                .sort({ createdAt: -1 })
                .limit(5)
                .populate('customer', 'name')
                .select('totalAmount date channel customer products')
                .lean();
        } else {
            recentActivityQuery = Sale.aggregate([
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
                { $unwind: "$products" },
                { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
                { $unwind: "$productDetails" },
                { $match: productMatch },
                { $group: { _id: "$paymentMethod", value: { $sum: "$products.subtotal" } } }
            ]
            : [{ $group: { _id: "$paymentMethod", value: { $sum: "$totalAmount" } } }];

        // 6. Sales by Category
        const categoryPipeline = [
            { $unwind: "$products" },
            { $lookup: { from: "products", localField: "products.product", foreignField: "_id", as: "productDetails" } },
            { $unwind: "$productDetails" },
            ...(isFiltered ? [{ $match: productMatch }] : []),
            { $group: { _id: "$productDetails.category", value: { $sum: "$products.subtotal" } } }
        ];

        // ─── Execute ALL queries IN PARALLEL ────────────────────────────────────
        const [
            salesStats,
            productsStats,
            recentActivity,
            salesTrend,
            salesByPaymentMethod,
            salesByCategory
        ] = await Promise.all([
            Sale.aggregate(salesStatsPipeline),
            Product.aggregate(productsStatsPipeline),
            recentActivityQuery,
            Sale.aggregate(trendPipeline),
            Sale.aggregate(paymentPipeline),
            Sale.aggregate(categoryPipeline)
        ]);

        // ─── Format Results ──────────────────────────────────────────────────────
        const totalSales = salesStats.length > 0 ? salesStats[0].totalSales : 0;
        const totalProfit = salesStats.length > 0 ? salesStats[0].totalProfit : 0;
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
