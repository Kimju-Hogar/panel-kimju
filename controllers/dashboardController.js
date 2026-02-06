const Sale = require('../models/Sale');
const Product = require('../models/Product');

// @desc    Get dashboard statistics
// @route   GET /api/dashboard
// @access  Private
const getDashboardStats = async (req, res) => {
    try {
        // 1. Calculate Total Sales & Total Profit
        const salesStats = await Sale.aggregate([
            {
                $group: {
                    _id: null,
                    totalSales: { $sum: "$totalAmount" },
                    totalProfit: { $sum: "$totalProfit" }
                }
            }
        ]);

        const totalSales = salesStats.length > 0 ? salesStats[0].totalSales : 0;
        const totalProfit = salesStats.length > 0 ? salesStats[0].totalProfit : 0;

        // 2. Calculate Stock Value & Low Stock Count
        const productsStats = await Product.aggregate([
            {
                $project: {
                    stockValue: { $multiply: ["$costPrice", "$stock"] },
                    isLowStock: { $lt: ["$stock", "$minStock"] }
                }
            },
            {
                $group: {
                    _id: null,
                    totalStockValue: { $sum: "$stockValue" },
                    lowStockCount: {
                        $sum: { $cond: ["$isLowStock", 1, 0] }
                    }
                }
            }
        ]);

        const stockValue = productsStats.length > 0 ? productsStats[0].totalStockValue : 0;
        const lowStockCount = productsStats.length > 0 ? productsStats[0].lowStockCount : 0;

        // 3. Get Recent Activity (Last 5 Sales)
        const recentActivity = await Sale.find()
            .sort({ createdAt: -1 })
            .limit(5)
            .populate('customer', 'name')
            .select('totalAmount date channel customer products');

        // 4. Get Sales Trend (Last 7 Days)
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
        sevenDaysAgo.setHours(0, 0, 0, 0);

        const salesTrend = await Sale.aggregate([
            {
                $match: {
                    date: { $gte: sevenDaysAgo }
                }
            },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$date" } },
                    sales: { $sum: "$totalAmount" }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        // 5. Sales by Payment Method
        const salesByPaymentMethod = await Sale.aggregate([
            {
                $group: {
                    _id: "$paymentMethod",
                    value: { $sum: "$totalAmount" }
                }
            }
        ]);

        // 6. Sales by Category
        const salesByCategory = await Sale.aggregate([
            { $unwind: "$products" },
            {
                $lookup: {
                    from: "products",
                    localField: "products.product",
                    foreignField: "_id",
                    as: "productDetails"
                }
            },
            { $unwind: "$productDetails" },
            {
                $group: {
                    _id: "$productDetails.category",
                    value: { $sum: "$products.subtotal" }
                }
            }
        ]);

        // Format salesTrend for the chart (ensure all days are present or just return data)
        // For simplicity, we return what we have. The frontend can handle missing days or we map it here.
        // Let's map it here to be cleaner for Recharts.
        const formattedTrend = salesTrend.map(item => {
            const date = new Date(item._id);
            const days = ['Dom', 'Lun', 'Mar', 'Mie', 'Jue', 'Vie', 'Sab'];
            return {
                name: days[date.getDay()], // Day name
                fullDate: item._id,
                sales: item.sales
            };
        });

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

module.exports = {
    getDashboardStats
};
