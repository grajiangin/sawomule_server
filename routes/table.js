const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get all tables
router.get('/', async (req, res) => {
  try {
    const tables = await prisma.table.findMany({
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            created_at: true
          }
        }
      }
    });
    res.status(200).json(tables);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get table by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const table = await prisma.table.findUnique({
      where: { id: Number(id) },
      include: {
        orders: {
          select: {
            id: true,
            status: true,
            created_at: true
          }
        }
      }
    });
    
    if (!table) {
      return res.status(404).json({
        status: 'fail',
        message: 'Table not found'
      });
    }
    
    res.status(200).json(table);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Create new table - Admin only
router.post('/', isAdmin, async (req, res) => {
  try {
    const { table_number, is_available } = req.body;
    
    const newTable = await prisma.table.create({
      data: {
        table_number,
        is_available: is_available !== undefined ? Boolean(is_available) : true
      }
    });
    
    res.status(201).json(newTable);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Update table - Admin only
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { table_number, is_available } = req.body;
    
    const updatedTable = await prisma.table.update({
      where: { id: Number(id) },
      data: {
        table_number: table_number || undefined,
        is_available: is_available !== undefined ? Boolean(is_available) : undefined
      }
    });
    
    res.status(200).json(updatedTable);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Delete table - Admin only
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.table.delete({
      where: { id: Number(id) }
    });
    
    res.status(204).json({"message": "Table deleted"});
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

module.exports = router; 