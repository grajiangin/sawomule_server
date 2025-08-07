const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { isAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get all categories
router.get('/categories', async (req, res) => {
  console.log('get all categories');
  try {
    const categories = await prisma.category.findMany();
    console.log(categories);
    res.status(200).json(categories);
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get all menu items
router.get('/', async (req, res) => {
  try {
    const menus = await prisma.menu.findMany({
      include: {
        category: {
          select: {
            name: true,
            id: true
          }
        },
        kitchen: true
      },
      orderBy: {
        name: 'asc'
      }
    });
    res.status(200).json(menus);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Get menu item by ID
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const menu = await prisma.menu.findUnique({
      where: { id: Number(id) },
      include: {
        category: true,
        kitchen: true
      }
    });
    
    if (!menu) {
      return res.status(404).json({
        status: 'fail',
        message: 'Menu item not found'
      });
    }
    
    res.status(200).json(menu);
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Create new menu item - Admin only
router.post('/', isAdmin, async (req, res) => {
  try {
    const { name, description, price, is_buffet, category_id, kitchen_id, is_available } = req.body;
    
    const newMenu = await prisma.menu.create({
      data: {
        name,
        description,
        price: Number(price),
        is_buffet: Boolean(is_buffet),
        is_available: Boolean(is_available),
        category_id: category_id ? Number(category_id) : null,
        kitchen_id: kitchen_id ? Number(kitchen_id) : null
      },
      include: {
        category: true,
        kitchen: true
      }
    });
    
    res.status(201).json(newMenu);
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Update menu item - Admin only
router.put('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, price, is_buffet, category_id, kitchen_id, is_available } = req.body;
    
    const updatedMenu = await prisma.menu.update({
      where: { id: Number(id) },
      data: {
        name,
        description,
        price: price ? Number(price) : undefined,
        is_buffet: is_buffet !== undefined ? Boolean(is_buffet) : undefined,
        is_available: is_available !== undefined ? Boolean(is_available) : undefined,
        category_id: category_id ? Number(category_id) : null,
        kitchen_id: kitchen_id ? Number(kitchen_id) : null
      },
      include: {
        category: true,
        kitchen: true
      }
    });
    
    res.status(200).json(updatedMenu);
  } catch (error) {
    console.log(error);
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

// Delete menu item - Admin only
router.delete('/:id', isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.menu.delete({
      where: { id: Number(id) }
    });
    
    res.status(204).json({"message": "Menu item deleted"});
  } catch (error) {
    res.status(400).json({
      status: 'fail',
      message: error.message
    });
  }
});

module.exports = router;
