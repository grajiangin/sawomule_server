const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const PDFGenerator = require('../utils/pdfGenerator');

const router = express.Router();
const prisma = new PrismaClient();

// Get dashboard analytics
router.get('/dashboard', auth, async (req, res) => {
  try {
    const { range = 'today', start_date, end_date } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    let previousStartDate = new Date();
    
    // Handle custom date range
    if (range === 'custom' && start_date && end_date) {
      startDate = new Date(start_date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      
      // Calculate previous period for comparison (same duration)
      const duration = endDate.getTime() - startDate.getTime();
      previousStartDate = new Date(startDate.getTime() - duration);
      previousStartDate.setHours(0, 0, 0, 0);
      
      // Get current period data (based on order creation date)
      const [currentPeriodOrders, tables] = await Promise.all([
        prisma.order.findMany({
          where: {
            created_at: {
              gte: startDate,
              lte: endDate
            },
            status: 'COMPLETED'
          },
          include: {
            payment: true,
            table: true,
            order_items: {
              include: {
                menu: true
              }
            }
          }
        }),
        prisma.table.findMany()
      ]);

      // Get previous period orders for trend calculation (based on order creation date)
      const previousPeriodOrders = await prisma.order.findMany({
        where: {
          created_at: {
            gte: previousStartDate,
            lte: startDate
          },
          status: 'COMPLETED'
        },
        include: {
          payment: true,
          order_items: {
            include: {
              menu: true
            }
          }
        }
      });

      // Calculate current period metrics
      const revenue = currentPeriodOrders.reduce((sum, order) => {
        const orderAmount = order.order_items.reduce((itemSum, item) => {
          if (item.status !== 'CANCELLED') {
            return itemSum + (item.menu_price * item.quantity);
          }
          return itemSum;
        }, 0);
        return sum + orderAmount;
      }, 0);
      
      const orderCount = currentPeriodOrders.length;
      
      const averageOrder = orderCount > 0 ? revenue / orderCount : 0;
      
      const occupiedTables = new Set(
        currentPeriodOrders
          .filter(order => order.table_id && order.status !== 'COMPLETED')
          .map(order => order.table_id)
      ).size;

      // Calculate previous period metrics for trends
      const previousRevenue = previousPeriodOrders.reduce((sum, order) => {
        const orderAmount = order.order_items.reduce((itemSum, item) => {
          if (item.status !== 'CANCELLED') {
            return itemSum + (item.menu_price * item.quantity);
          }
          return itemSum;
        }, 0);
        return sum + orderAmount;
      }, 0);
      
      const previousOrderCount = previousPeriodOrders.length;
      
      const previousAverageOrder = previousOrderCount > 0 ? 
        previousRevenue / previousOrderCount : 0;

      // Calculate trends (percentage change)
      const revenueTrend = previousRevenue > 0 ? 
        ((revenue - previousRevenue) / previousRevenue) * 100 : 0;
      
      const orderTrend = previousOrderCount > 0 ? 
        ((orderCount - previousOrderCount) / previousOrderCount) * 100 : 0;
      
      const avgOrderTrend = previousAverageOrder > 0 ? 
        ((averageOrder - previousAverageOrder) / previousAverageOrder) * 100 : 0;

      return res.status(200).json({
        revenue,
        order_count: orderCount,
        average_order: averageOrder,
        table_occupancy: occupiedTables,
        total_tables: tables.length,
        revenue_trend: revenueTrend,
        order_trend: orderTrend,
        avg_order_trend: avgOrderTrend
      });
    }
    
    // Handle predefined ranges
    switch (range) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        previousStartDate.setDate(previousStartDate.getDate() - 1);
        previousStartDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - 7);
        previousStartDate.setHours(0, 0, 0, 0);
        previousStartDate.setDate(previousStartDate.getDate() - 14);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        previousStartDate.setMonth(previousStartDate.getMonth() - 2);
        break;
      case '2months':
        startDate.setMonth(startDate.getMonth() - 2);
        previousStartDate.setMonth(previousStartDate.getMonth() - 4);
        break;
      case '3months':
        startDate.setMonth(startDate.getMonth() - 3);
        previousStartDate.setMonth(previousStartDate.getMonth() - 6);
        break;
      case '6months':
        startDate.setMonth(startDate.getMonth() - 6);
        previousStartDate.setMonth(previousStartDate.getMonth() - 12);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 2);
        break;
      default:
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid range. Must be today, week, month, 2months, 3months, 6months, year, or custom with start_date and end_date'
        });
    }

    // Get current period data (based on order creation date)
    const [currentPeriodOrders, tables] = await Promise.all([
      prisma.order.findMany({
        where: {
          created_at: {
            gte: startDate,
            lte: now
          },
          status: 'COMPLETED'
        },
        include: {
          payment: true,
          table: true,
          order_items: {
            include: {
              menu: true
            }
          }
        }
      }),
      prisma.table.findMany()
    ]);

    // Get previous period orders for trend calculation (based on order creation date)
    const previousPeriodOrders = await prisma.order.findMany({
      where: {
        created_at: {
          gte: previousStartDate,
          lte: startDate
        },
        status: 'COMPLETED'
      },
      include: {
        payment: true,
        order_items: {
          include: {
            menu: true
          }
        }
      }
    });

    // Calculate current period metrics
    const revenue = currentPeriodOrders.reduce((sum, order) => {
      const orderAmount = order.order_items.reduce((itemSum, item) => {
        if (item.status !== 'CANCELLED') {
          return itemSum + (item.menu_price * item.quantity);
        }
        return itemSum;
      }, 0);
      return sum + orderAmount;
    }, 0);
    
    const orderCount = currentPeriodOrders.length;
    
    const averageOrder = orderCount > 0 ? revenue / orderCount : 0;
    
    const occupiedTables = new Set(
      currentPeriodOrders
        .filter(order => order.table_id && order.status !== 'COMPLETED')
        .map(order => order.table_id)
    ).size;

    // Calculate previous period metrics for trends
    const previousRevenue = previousPeriodOrders.reduce((sum, order) => {
      const orderAmount = order.order_items.reduce((itemSum, item) => {
        if (item.status !== 'CANCELLED') {
          return itemSum + (item.menu_price * item.quantity);
        }
        return itemSum;
      }, 0);
      return sum + orderAmount;
    }, 0);
    
    const previousOrderCount = previousPeriodOrders.length;
    
    const previousAverageOrder = previousOrderCount > 0 ? 
      previousRevenue / previousOrderCount : 0;

    // Calculate trends (percentage change)
    const revenueTrend = previousRevenue > 0 ? 
      ((revenue - previousRevenue) / previousRevenue) * 100 : 0;
    
    const orderTrend = previousOrderCount > 0 ? 
      ((orderCount - previousOrderCount) / previousOrderCount) * 100 : 0;
    
    const avgOrderTrend = previousAverageOrder > 0 ? 
      ((averageOrder - previousAverageOrder) / previousAverageOrder) * 100 : 0;

    res.status(200).json({
      revenue,
      order_count: orderCount,
      average_order: averageOrder,
      table_occupancy: occupiedTables,
      total_tables: tables.length,
      revenue_trend: revenueTrend,
      order_trend: orderTrend,
      avg_order_trend: avgOrderTrend
    });
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get popular items
router.get('/popular-items', auth, async (req, res) => {
  try {
    const { range = 'today', start_date, end_date } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    let endDate = now;
    
    // Handle custom date range
    if (range === 'custom' && start_date && end_date) {
      startDate = new Date(start_date);
      startDate.setHours(0, 0, 0, 0);
      endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
    } else {
      // Handle predefined ranges
      switch (range) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setDate(startDate.getDate() - 7);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          break;
        case '2months':
          startDate.setMonth(startDate.getMonth() - 2);
          break;
        case '3months':
          startDate.setMonth(startDate.getMonth() - 3);
          break;
        case '6months':
          startDate.setMonth(startDate.getMonth() - 6);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          break;
        default:
          return res.status(400).json({
            status: 'fail',
            message: 'Invalid range. Must be today, week, month, 2months, 3months, 6months, year, or custom with start_date and end_date'
          });
      }
    }

    // Get order items with their menus
    const orderItems = await prisma.orderItem.findMany({
      where: {
        order: {
          created_at: {
            gte: startDate,
            lte: endDate
          },
          status: 'COMPLETED'
        }
      },
      include: {
        menu: true
      }
    });

    // Group and aggregate by menu
    const menuStats = orderItems.reduce((acc, item) => {
      if (!acc[item.menu_id]) {
        acc[item.menu_id] = {
          name: item.menu.name,
          order_count: 0,
          revenue: 0
        };
      }
      acc[item.menu_id].order_count += item.quantity;
      acc[item.menu_id].revenue += item.menu_price * item.quantity;
      return acc;
    }, {});

    // Convert to array and sort by order count
    const popularItems = Object.values(menuStats)
      .sort((a, b) => b.order_count - a.order_count)
      .slice(0, 10); // Get top 10

    res.status(200).json(popularItems);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get realtime data
router.get('/realtime_data', auth, async (req, res) => {
  try {
    // Get active orders (IN_PROGRESS and READY)
    const activeOrders = await prisma.order.findMany({
      where: {
        status: {
          in: ['IN_PROGRESS', 'READY']
        }
      },
      include: {
        table: true,
        waiter: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        order_items: {
          include: {
            menu: true
          }
        }
      },
      orderBy: {
        created_at: 'asc'
      }
    });

    // Get all tables
    var  tables = await prisma.table.findMany({
      orderBy: {
        table_number: 'asc'
      }
    });
    activeOrders.forEach(order => {
      tables.forEach(table => {
        console.log("HERE!");
        if (table.id === order.table_id) {
          table.availability = false;
          console.log(tables);
        }
      });
    });
    // Count orders by status

    // Count orders by status
    const orderStatus = {
      in_progress: activeOrders.filter(order => order.status === 'IN_PROGRESS').length,
      ready: activeOrders.filter(order => order.status === 'READY').length
    };

    res.status(200).json({
      order_status: orderStatus,
      tables: tables.map(table => ({
        name: table.table_number,
        availability: table.availability
      })),
      active_orders: activeOrders
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get data with date range
router.get('/data', auth, async (req, res) => {
  try {
    const { range = 'today', start_date, end_date } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    let previousStartDate = new Date();

    // Handle custom date range
    if (range === 'custom' && start_date && end_date) {
      startDate = new Date(start_date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      
      // Calculate previous period for comparison (same duration)
      const duration = endDate.getTime() - startDate.getTime();
      previousStartDate = new Date(startDate.getTime() - duration);
      previousStartDate.setHours(0, 0, 0, 0);
      
      // Get orders within custom date range (based on order creation date)
      const orders = await prisma.order.findMany({
        where: {
          created_at: {
            gte: startDate,
            lte: endDate
          },
          status: 'COMPLETED'
        },
        include: {
          payment: true,
          order_items: {
            include: {
              menu: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Calculate basic metrics based on orders
      const revenue = orders.reduce((sum, order) => {
        const orderAmount = order.order_items.reduce((itemSum, item) => {
          if (item.status !== 'CANCELLED') {
            return itemSum + (item.menu_price * item.quantity);
          }
          return itemSum;
        }, 0);
        return sum + orderAmount;
      }, 0);
      const orderCount = orders.length;
      const averageOrderSpent = orderCount > 0 ? revenue / orderCount : 0;

      // Calculate revenue by payment method
      const revenueByMethod = orders.reduce((acc, order) => {
        if (order.payment) {
          const orderAmount = order.order_items.reduce((itemSum, item) => {
            if (item.status !== 'CANCELLED') {
              return itemSum + (item.menu_price * item.quantity);
            }
            return itemSum;
          }, 0);
          
          const method = order.payment.payment_method.toLowerCase();
          acc[method] = (acc[method] || 0) + orderAmount;
        }
        return acc;
      }, { cash: 0, qris: 0 });

      // Process menu statistics with kitchen information
      const menuStats = {};
      orders.forEach(order => {
        order.order_items.forEach(item => {
          if (!menuStats[item.menu_id]) {
            menuStats[item.menu_id] = {
              name: item.menu_name,
              order_count: 0,
              revenue: 0,
              kitchen_name: item.kitchen_name || 'No Kitchen'
            };
          }
          menuStats[item.menu_id].order_count += item.quantity;
          menuStats[item.menu_id].revenue += item.menu_price * item.quantity;
        });
      });

      // Get all menus (no limit - show all sold menu items)
      const topMenus = Object.values(menuStats)
        .sort((a, b) => b.order_count - a.order_count);

      // Get order details for the order table
      const orderDetails = orders.map(order => {
        // Calculate individual order amount from order items
        const orderAmount = order.order_items.reduce((sum, item) => {
          if (item.status !== 'CANCELLED') {
            return sum + (item.menu_price * item.quantity);
          }
          return sum;
        }, 0);

        return {
          order_number: order.order_number,
          customer_name: order.customer_name || 'N/A',
          total_amount: orderAmount,
          created_at: order.created_at,
          status: order.status
        };
      });

      // Sort orders by creation date (newest first)
      orderDetails.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Calculate daily revenue for the custom range (based on order creation date)
      const dailyRevenue = [];
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        const dayRevenue = orders
          .filter(order => {
            const orderDate = new Date(order.created_at);
            return orderDate >= dayStart && orderDate <= dayEnd;
          })
          .reduce((sum, order) => {
            const orderAmount = order.order_items.reduce((itemSum, item) => {
              if (item.status !== 'CANCELLED') {
                return itemSum + (item.menu_price * item.quantity);
              }
              return itemSum;
            }, 0);
            return sum + orderAmount;
          }, 0);
        
        dailyRevenue.push({
          date: dayStart.toISOString().split('T')[0],
          revenue: dayRevenue
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      return res.status(200).json({
        range: 'custom',
        start_date: startDate,
        end_date: endDate,
        revenue,
        order_count: orderCount,
        average_order_spent: averageOrderSpent,
        revenue_cash: revenueByMethod.cash,
        revenue_qris: revenueByMethod.qris,
        top_menus: topMenus,
        daily_revenue: dailyRevenue,
        order_details: orderDetails
      });
    }
    
    // Handle predefined ranges
    switch (range) {
      case 'today':
        startDate.setHours(0, 0, 0, 0);
        previousStartDate.setDate(previousStartDate.getDate() - 1);
        previousStartDate.setHours(0, 0, 0, 0);
        break;
      case 'week':
        startDate.setHours(0, 0, 0, 0);
        startDate.setDate(startDate.getDate() - 7);
        previousStartDate.setHours(0, 0, 0, 0);
        previousStartDate.setDate(previousStartDate.getDate() - 14);
        break;
      case 'month':
        startDate.setMonth(startDate.getMonth() - 1);
        previousStartDate.setMonth(previousStartDate.getMonth() - 2);
        break;
      case '2months':
        startDate.setMonth(startDate.getMonth() - 2);
        previousStartDate.setMonth(previousStartDate.getMonth() - 4);
        break;
      case '3months':
        startDate.setMonth(startDate.getMonth() - 3);
        previousStartDate.setMonth(previousStartDate.getMonth() - 6);
        break;
      case '6months':
        startDate.setMonth(startDate.getMonth() - 6);
        previousStartDate.setMonth(previousStartDate.getMonth() - 12);
        break;
      case 'year':
        startDate.setFullYear(startDate.getFullYear() - 1);
        previousStartDate.setFullYear(previousStartDate.getFullYear() - 2);
        break;
      default:
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid range. Must be today, week, month, 2months, 3months, 6months, year, or custom with start_date and end_date'
        });
    }

    // Get orders within date range (based on order creation date)
    const orders = await prisma.order.findMany({
      where: {
        created_at: {
          gte: startDate,
          lte: now
        },
        status: 'COMPLETED'
      },
      include: {
        payment: true,
        order_items: {
          include: {
            menu: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    // Calculate basic metrics based on orders
    const revenue = orders.reduce((sum, order) => {
      const orderAmount = order.order_items.reduce((itemSum, item) => {
        if (item.status !== 'CANCELLED') {
          return itemSum + (item.menu_price * item.quantity);
        }
        return itemSum;
      }, 0);
      return sum + orderAmount;
    }, 0);
    const orderCount = orders.length;
    const averageOrderSpent = orderCount > 0 ? revenue / orderCount : 0;

    // Calculate revenue by payment method
    const revenueByMethod = orders.reduce((acc, order) => {
      if (order.payment) {
        const orderAmount = order.order_items.reduce((itemSum, item) => {
          if (item.status !== 'CANCELLED') {
            return itemSum + (item.menu_price * item.quantity);
          }
          return itemSum;
        }, 0);
        
        const method = order.payment.payment_method.toLowerCase();
        acc[method] = (acc[method] || 0) + orderAmount;
      }
      return acc;
    }, { cash: 0, qris: 0 });

    // Process menu statistics with kitchen information
    const menuStats = {};
    orders.forEach(order => {
      order.order_items.forEach(item => {
        if (!menuStats[item.menu_id]) {
          menuStats[item.menu_id] = {
            name: item.menu_name,
            order_count: 0,
            revenue: 0,
            kitchen_name: item.kitchen_name || 'No Kitchen'
          };
        }
        menuStats[item.menu_id].order_count += item.quantity;
        menuStats[item.menu_id].revenue += item.menu_price * item.quantity;
      });
    });

    // Get all menus (no limit - show all sold menu items)
    const topMenus = Object.values(menuStats)
      .sort((a, b) => b.order_count - a.order_count);

    // Get order details for the order table
    const orderDetails = orders.map(order => {
      // Calculate individual order amount from order items
      const orderAmount = order.order_items.reduce((sum, item) => {
        if (item.status !== 'CANCELLED') {
          return sum + (item.menu_price * item.quantity);
        }
        return sum;
      }, 0);

      return {
        order_number: order.order_number,
        customer_name: order.customer_name || 'N/A',
        total_amount: orderAmount,
        created_at: order.created_at,
        status: order.status
      };
    });

    // Sort orders by creation date (newest first)
    orderDetails.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

    // Calculate daily revenue (based on order creation date)
    const dailyRevenue = [];
    let currentDate = new Date(startDate);
    while (currentDate <= now) {
      const dayStart = new Date(currentDate);
      const dayEnd = new Date(currentDate);
      dayEnd.setHours(23, 59, 59, 999);
      
      const dayRevenue = orders
        .filter(order => {
          const orderDate = new Date(order.created_at);
          return orderDate >= dayStart && orderDate <= dayEnd;
        })
        .reduce((sum, order) => {
          const orderAmount = order.order_items.reduce((itemSum, item) => {
            if (item.status !== 'CANCELLED') {
              return itemSum + (item.menu_price * item.quantity);
            }
            return itemSum;
          }, 0);
          return sum + orderAmount;
        }, 0);
      
      dailyRevenue.push({
        date: dayStart.toISOString().split('T')[0],
        revenue: dayRevenue
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    res.status(200).json({
      range,
      start_date: startDate,
      end_date: now,
      revenue,
      order_count: orderCount,
      average_order_spent: averageOrderSpent,
      revenue_cash: revenueByMethod.cash,
      revenue_qris: revenueByMethod.qris,
      top_menus: topMenus,
      daily_revenue: dailyRevenue,
      order_details: orderDetails
    });
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Download analytics PDF
router.get('/download-pdf', async (req, res) => {
  try {
    const { range = 'today', start_date, end_date } = req.query;
    
    // Calculate date range
    const now = new Date();
    let startDate = new Date();
    let previousStartDate = new Date();

    // Handle custom date range
    if (range === 'custom' && start_date && end_date) {
      startDate = new Date(start_date);
      startDate.setHours(0, 0, 0, 0);
      const endDate = new Date(end_date);
      endDate.setHours(23, 59, 59, 999);
      
      // Calculate previous period for comparison (same duration)
      const duration = endDate.getTime() - startDate.getTime();
      previousStartDate = new Date(startDate.getTime() - duration);
      previousStartDate.setHours(0, 0, 0, 0);
      
      // Get orders within custom date range (based on order creation date)
      const orders = await prisma.order.findMany({
        where: {
          created_at: {
            gte: startDate,
            lte: endDate
          },
          status: 'COMPLETED'
        },
        include: {
          payment: true,
          order_items: {
            include: {
              menu: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Calculate basic metrics based on orders
      const revenue = orders.reduce((sum, order) => {
        const orderAmount = order.order_items.reduce((itemSum, item) => {
          if (item.status !== 'CANCELLED') {
            return itemSum + (item.menu_price * item.quantity);
          }
          return itemSum;
        }, 0);
        return sum + orderAmount;
      }, 0);
      const orderCount = orders.length;
      const averageOrderSpent = orderCount > 0 ? revenue / orderCount : 0;

      // Calculate revenue by payment method
      const revenueByMethod = orders.reduce((acc, order) => {
        if (order.payment) {
          const orderAmount = order.order_items.reduce((itemSum, item) => {
            if (item.status !== 'CANCELLED') {
              return itemSum + (item.menu_price * item.quantity);
            }
            return itemSum;
          }, 0);
          
          const method = order.payment.payment_method.toLowerCase();
          acc[method] = (acc[method] || 0) + orderAmount;
        }
        return acc;
      }, { cash: 0, qris: 0 });

      // Process menu statistics with kitchen information
      const menuStats = {};
      orders.forEach(order => {
        order.order_items.forEach(item => {
          if (!menuStats[item.menu_id]) {
            menuStats[item.menu_id] = {
              name: item.menu_name,
              order_count: 0,
              revenue: 0,
              kitchen_name: item.kitchen_name || 'No Kitchen'
            };
          }
          menuStats[item.menu_id].order_count += item.quantity;
          menuStats[item.menu_id].revenue += item.menu_price * item.quantity;
        });
      });

      // Get all menus (no limit - show all sold menu items)
      const topMenus = Object.values(menuStats)
        .sort((a, b) => b.order_count - a.order_count);

      // Get order details for the order table
      const orderDetails = orders.map(order => {
        // Calculate individual order amount from order items
        const orderAmount = order.order_items.reduce((sum, item) => {
          if (item.status !== 'CANCELLED') {
            return sum + (item.menu_price * item.quantity);
          }
          return sum;
        }, 0);

        return {
          order_number: order.order_number,
          customer_name: order.customer_name || 'N/A',
          total_amount: orderAmount,
          created_at: order.created_at,
          status: order.status
        };
      });

      // Sort orders by creation date (newest first)
      orderDetails.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Calculate daily revenue for the custom range (based on order creation date)
      const dailyRevenue = [];
      let currentDate = new Date(startDate);
      while (currentDate <= endDate) {
        const dayStart = new Date(currentDate);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        const dayRevenue = orders
          .filter(order => {
            const orderDate = new Date(order.created_at);
            return orderDate >= dayStart && orderDate <= dayEnd;
          })
          .reduce((sum, order) => {
            const orderAmount = order.order_items.reduce((itemSum, item) => {
              if (item.status !== 'CANCELLED') {
                return itemSum + (item.menu_price * item.quantity);
              }
              return itemSum;
            }, 0);
            return sum + orderAmount;
          }, 0);
        
        dailyRevenue.push({
          date: dayStart.toISOString().split('T')[0],
          revenue: dayRevenue
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const analyticsData = {
        range: 'custom',
        start_date: startDate,
        end_date: endDate,
        revenue,
        order_count: orderCount,
        average_order_spent: averageOrderSpent,
        revenue_cash: revenueByMethod.cash,
        revenue_qris: revenueByMethod.qris,
        top_menus: topMenus,
        daily_revenue: dailyRevenue,
        order_details: orderDetails
      };

      // Generate PDF
      const pdfGenerator = new PDFGenerator();
      const pdfBuffer = await pdfGenerator.generateAnalyticsReport(analyticsData, range, startDate, endDate);
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-report-${range}-${new Date().toISOString().split('T')[0]}.pdf"`);
      
      // Send the PDF buffer
      res.send(pdfBuffer);

    } else {
      // Handle predefined ranges
      switch (range) {
        case 'today':
          startDate.setHours(0, 0, 0, 0);
          previousStartDate.setDate(previousStartDate.getDate() - 1);
          previousStartDate.setHours(0, 0, 0, 0);
          break;
        case 'week':
          startDate.setHours(0, 0, 0, 0);
          startDate.setDate(startDate.getDate() - 7);
          previousStartDate.setHours(0, 0, 0, 0);
          previousStartDate.setDate(previousStartDate.getDate() - 14);
          break;
        case 'month':
          startDate.setMonth(startDate.getMonth() - 1);
          previousStartDate.setMonth(previousStartDate.getMonth() - 2);
          break;
        case '2months':
          startDate.setMonth(startDate.getMonth() - 2);
          previousStartDate.setMonth(previousStartDate.getMonth() - 4);
          break;
        case '3months':
          startDate.setMonth(startDate.getMonth() - 3);
          previousStartDate.setMonth(previousStartDate.getMonth() - 6);
          break;
        case '6months':
          startDate.setMonth(startDate.getMonth() - 6);
          previousStartDate.setMonth(previousStartDate.getMonth() - 12);
          break;
        case 'year':
          startDate.setFullYear(startDate.getFullYear() - 1);
          previousStartDate.setFullYear(previousStartDate.getFullYear() - 2);
          break;
        default:
          return res.status(400).json({
            status: 'fail',
            message: 'Invalid range. Must be today, week, month, 2months, 3months, 6months, year, or custom with start_date and end_date'
          });
      }

      // Get orders within date range (based on order creation date)
      const orders = await prisma.order.findMany({
        where: {
          created_at: {
            gte: startDate,
            lte: now
          },
          status: 'COMPLETED'
        },
        include: {
          payment: true,
          order_items: {
            include: {
              menu: true
            }
          }
        },
        orderBy: {
          created_at: 'desc'
        }
      });

      // Calculate basic metrics based on orders
      const revenue = orders.reduce((sum, order) => {
        const orderAmount = order.order_items.reduce((itemSum, item) => {
          if (item.status !== 'CANCELLED') {
            return itemSum + (item.menu_price * item.quantity);
          }
          return itemSum;
        }, 0);
        return sum + orderAmount;
      }, 0);
      const orderCount = orders.length;
      const averageOrderSpent = orderCount > 0 ? revenue / orderCount : 0;

      // Calculate revenue by payment method
      const revenueByMethod = orders.reduce((acc, order) => {
        if (order.payment) {
          const orderAmount = order.order_items.reduce((itemSum, item) => {
            if (item.status !== 'CANCELLED') {
              return itemSum + (item.menu_price * item.quantity);
            }
            return itemSum;
          }, 0);
          
          const method = order.payment.payment_method.toLowerCase();
          acc[method] = (acc[method] || 0) + orderAmount;
        }
        return acc;
      }, { cash: 0, qris: 0 });

      // Process menu statistics with kitchen information
      const menuStats = {};
      orders.forEach(order => {
        order.order_items.forEach(item => {
          if (!menuStats[item.menu_id]) {
            menuStats[item.menu_id] = {
              name: item.menu_name,
              order_count: 0,
              revenue: 0,
              kitchen_name: item.kitchen_name || 'No Kitchen'
            };
          }
          menuStats[item.menu_id].order_count += item.quantity;
          menuStats[item.menu_id].revenue += item.menu_price * item.quantity;
        });
      });

      // Get all menus (no limit - show all sold menu items)
      const topMenus = Object.values(menuStats)
        .sort((a, b) => b.order_count - a.order_count);

      // Get order details for the order table
      const orderDetails = orders.map(order => {
        // Calculate individual order amount from order items
        const orderAmount = order.order_items.reduce((sum, item) => {
          if (item.status !== 'CANCELLED') {
            return sum + (item.menu_price * item.quantity);
          }
          return sum;
        }, 0);

        return {
          order_number: order.order_number,
          customer_name: order.customer_name || 'N/A',
          total_amount: orderAmount,
          created_at: order.created_at,
          status: order.status
        };
      });

      // Sort orders by creation date (newest first)
      orderDetails.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

      // Calculate daily revenue (based on order creation date)
      const dailyRevenue = [];
      let currentDate = new Date(startDate);
      while (currentDate <= now) {
        const dayStart = new Date(currentDate);
        const dayEnd = new Date(currentDate);
        dayEnd.setHours(23, 59, 59, 999);
        
        const dayRevenue = orders
          .filter(order => {
            const orderDate = new Date(order.created_at);
            return orderDate >= dayStart && orderDate <= dayEnd;
          })
          .reduce((sum, order) => {
            const orderAmount = order.order_items.reduce((itemSum, item) => {
              if (item.status !== 'CANCELLED') {
                return itemSum + (item.menu_price * item.quantity);
              }
              return itemSum;
            }, 0);
            return sum + orderAmount;
          }, 0);
        
        dailyRevenue.push({
          date: dayStart.toISOString().split('T')[0],
          revenue: dayRevenue
        });
        currentDate.setDate(currentDate.getDate() + 1);
      }

      const analyticsData = {
        range,
        start_date: startDate,
        end_date: now,
        revenue,
        order_count: orderCount,
        average_order_spent: averageOrderSpent,
        revenue_cash: revenueByMethod.cash,
        revenue_qris: revenueByMethod.qris,
        top_menus: topMenus,
        daily_revenue: dailyRevenue,
        order_details: orderDetails
      };

      // Generate PDF
      const pdfGenerator = new PDFGenerator();
      const pdfBuffer = await pdfGenerator.generateAnalyticsReport(analyticsData, range, startDate, now);
      
      // Set response headers
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="analytics-report-${range}-${new Date().toISOString().split('T')[0]}.pdf"`);
      
      // Send the PDF buffer
      res.send(pdfBuffer);
    }
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

module.exports = router; 