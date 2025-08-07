const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');
const printer = require('../utils/printer');

const router = express.Router();
const prisma = new PrismaClient();

// Get all payments with optional filters
router.get('/', auth, async (req, res) => {
  try {
    const { start_date, end_date, payment_method } = req.query;

    // Build where clause based on filters
    let where = {};
    
    // Add payment method filter if provided
    if (payment_method) {
      if (!['CASH', 'QRIS'].includes(payment_method)) {
        return res.status(400).json({
          status: 'fail',
          message: 'Invalid payment method. Must be CASH or QRIS'
        });
      }
      where.payment_method = payment_method;
    }

    // Add date range filter if provided
    if (start_date || end_date) {
      where.created_at = {};
      
      if (start_date) { 
        where.created_at.gte = new Date(start_date);
      }
      
      if (end_date) {
        where.created_at.lte = new Date(end_date);
      }
    }

    console.log(where);

    const payments = await prisma.payment.findMany({
      where,
      include: {
        cashier: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        orders: {
          include: {
            order_items: {
              include: {
                menu: true
              }
            },
            table: true,
            waiter: {
              select: {
                id: true,
                username: true,
                role: true
              }
            }
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    // Calculate additional statistics
    const statistics = payments.reduce((stats, payment) => {
      // Update total amount
      stats.total_amount += payment.total_amount;
      
      // Count by payment method
      stats.payment_methods[payment.payment_method] = (stats.payment_methods[payment.payment_method] || 0) + 1;
      
      // Sum by payment method
      stats.payment_method_totals[payment.payment_method] = (stats.payment_method_totals[payment.payment_method] || 0) + payment.total_amount;
      
      return stats;
    }, {
      total_amount: 0,
      payment_methods: {},
      payment_method_totals: {}
    });

    res.status(200).json(payments);
  } catch (error) {
    console.error('Get payments error:', error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get payment by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const payment = await prisma.payment.findUnique({
      where: {
        id: Number(id)
      },
      include: {
        cashier: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        orders: {
          include: {
            order_items: {
              include: {
                menu: true
              }
            },
            table: true,
            waiter: {
              select: {
                id: true,
                username: true,
                role: true
              }
            }
          }
        }
      }
    });

    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found'
      });
    }

    res.status(200).json(payment);
  } catch (error) {
    console.error('Get payment error:', error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Reprint payment receipt
router.post('/:id/print', auth, async (req, res) => {
  try {
    const { id } = req.params;

    // Get orders associated with the payment
    const orders = await prisma.order.findMany({
      where: {
        payment_id: Number(id)
      },
      include: {
        table: true,
        order_items: {
          include: {
            menu: true
          }
        }
      }
    });

    if (orders.length === 0) {
      return res.status(404).json({
        status: 'fail',
        message: 'No orders found for this payment ID'
      });
    }

    // Get payment details
    const payment = await prisma.payment.findUnique({
      where: {
        id: Number(id)
      },
      include: {
        cashier: true
      }
    });

    if (!payment) {
      return res.status(404).json({
        status: 'fail',
        message: 'Payment not found'
      });
    }

    // Print customer receipt
    try {
      await printer.printCustomerReceipt(orders, payment);
    } catch (printError) {
      console.error('Failed to print customer receipt:', printError);
      return res.status(500).json({
        status: 'fail',
        message: 'Failed to print receipt',
        error: printError.message
      });
    }

    res.status(200).json({
      status: 'success',
      message: 'Receipt printed successfully'
    });
  } catch (error) {
    console.error('Print payment error:', error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get daily summary
router.get('/summary/daily', auth, async (req, res) => {
  try {
    const { date } = req.query;
    
    // Use provided date or default to today
    const targetDate = date ? new Date(date) : new Date();
    const startOfDay = new Date(targetDate.setHours(0, 0, 0, 0));
    const endOfDay = new Date(targetDate.setHours(23, 59, 59, 999));

    const payments = await prisma.payment.findMany({
      where: {
        created_at: {
          gte: startOfDay,
          lte: endOfDay
        }
      },
      include: {
        cashier: {
          select: {
            id: true,
            username: true,
            role: true
          }
        },
        orders: {
          include: {
            order_items: {
              include: {
                menu: true
              }
            }
          }
        }
      }
    });

    // Calculate summary statistics
    const summary = payments.reduce((stats, payment) => {
      // Update total amount
      stats.total_amount += payment.total_amount;
      
      // Count by payment method
      stats.payment_methods[payment.payment_method] = (stats.payment_methods[payment.payment_method] || 0) + 1;
      
      // Sum by payment method
      stats.payment_method_totals[payment.payment_method] = (stats.payment_method_totals[payment.payment_method] || 0) + payment.total_amount;
      
      // Count by cashier
      const cashierId = payment.cashier.id;
      if (!stats.cashier_summaries[cashierId]) {
        stats.cashier_summaries[cashierId] = {
          cashier: payment.cashier,
          total_amount: 0,
          transaction_count: 0,
          payment_methods: {}
        };
      }
      stats.cashier_summaries[cashierId].total_amount += payment.total_amount;
      stats.cashier_summaries[cashierId].transaction_count += 1;
      stats.cashier_summaries[cashierId].payment_methods[payment.payment_method] = 
        (stats.cashier_summaries[cashierId].payment_methods[payment.payment_method] || 0) + 1;

      return stats;
    }, {
      total_amount: 0,
      payment_methods: {},
      payment_method_totals: {},
      cashier_summaries: {}
    });

    res.status(200).json({
      date: startOfDay,
      summary,
      payments
    });
  } catch (error) {
    console.error('Get daily summary error:', error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

module.exports = router; 