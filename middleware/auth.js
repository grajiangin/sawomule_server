const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// Middleware to verify JWT token
const auth = async (req, res, next) => {
  try {
    // Get token from header
    console.log(
      "auth middleware"
    );
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        status: 'fail',
        message: 'Not authenticated. Please log in'
      });
    }
    
    const token = authHeader.split(' ')[1];
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    // Check if user exists
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId }
    });
    
    if (!user) {
      return res.status(401).json({
        status: 'fail',
        message: 'User no longer exists'
      });
    }
    
    // Attach user to request
    req.user = user;
    next();
  } catch (error) { console.log(
    "auth middleware",error
  );
    return res.status(401).json({
      status: 'fail',
      message: 'Not authenticated',
      error: error.message
    });
  }
};

// Middleware to check if user is admin
const isAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({
        status: 'fail',
        message: 'Access denied. Admin only.'
      });
    } 
    next();
  } catch (error) {
    res.status(500).json({
      status: 'error', 
      message: 'Something went wrong!'
    });
  }
};

module.exports = { auth, isAdmin };
