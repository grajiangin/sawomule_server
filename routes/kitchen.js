const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get all kitchens
router.get('/', auth, async (req, res) => {
  console.log("get kitchens");
  try {
    const kitchens = await prisma.kitchen.findMany({
      include: {
        menus: {
          include: {
            category: true
          }
        }
      },
      orderBy: {
        name: 'asc'
      }
    });
    res.status(200).json(kitchens);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get kitchen by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const kitchen = await prisma.kitchen.findUnique({
      where: { id: Number(id) },
      include: {
        menus: {
          include: {
            category: true
          }
        }
      }
    });

    if (!kitchen) {
      return res.status(404).json({
        status: 'fail',
        message: 'Kitchen not found'
      });
    }

    res.status(200).json(kitchen);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Create new kitchen
router.post('/', auth, isAdmin, async (req, res) => {
  try {
    const { name, use_printer, printer_ip, status } = req.body;

    // Validate status if provided
    if (status && !['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid status. Must be ACTIVE, INACTIVE, or MAINTENANCE'
      });
    }

    const kitchen = await prisma.kitchen.create({
      data: {
        name,
        use_printer: use_printer ?? true,
        printer_ip,
        status: status || 'ACTIVE'
      }
    });

    res.status(201).json(kitchen);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        status: 'fail',
        message: 'Kitchen name must be unique'
      });
    }
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Update kitchen
router.put('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, use_printer, printer_ip, status } = req.body;

    // Validate status if provided
    if (status && !['ACTIVE', 'INACTIVE', 'MAINTENANCE'].includes(status)) {
      return res.status(400).json({
        status: 'fail',
        message: 'Invalid status. Must be ACTIVE, INACTIVE, or MAINTENANCE'
      });
    }

    const kitchen = await prisma.kitchen.update({
      where: { id: Number(id) },
      data: {
        name,
        use_printer,
        printer_ip,
        status
      }
    });

    res.status(200).json(kitchen);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({
        status: 'fail',
        message: 'Kitchen name must be unique'
      });
    }
    if (error.code === 'P2025') {
      return res.status(404).json({
        status: 'fail',
        message: 'Kitchen not found'
      });
    }
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Delete kitchen
router.delete('/:id', auth, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    // Check if kitchen has any menus
    const kitchen = await prisma.kitchen.findUnique({
      where: { id: Number(id) },
      include: {
        menus: true
      }
    });

    if (!kitchen) {
      return res.status(404).json({
        status: 'fail',
        message: 'Kitchen not found'
      });
    }

    if (kitchen.menus.length > 0) {
      return res.status(400).json({
        status: 'fail',
        message: 'Cannot delete kitchen with associated menus'
      });
    }

    await prisma.kitchen.delete({
      where: { id: Number(id) }
    });

    res.status(204).send();
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

module.exports = router; 