const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'smart_school_jwt_super_secure_secret_2026';

function generateToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
      linked_student_id: user.linked_student_id,
      teacher_id: user.teacher_id,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

// Authentication middleware
function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

// Role-based authorization middleware
function authorize(roles = []) {
  if (typeof roles === 'string') {
    roles = [roles];
  }

  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Unauthorized.' });
    }
    if (roles.length && !roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access forbidden for role: ${req.user.role}` });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  generateToken,
  authenticate,
  authorize,
};

