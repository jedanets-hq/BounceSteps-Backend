// Middleware to handle duplicate key errors from PostgreSQL
const handleDuplicateKeyError = (err, req, res, next) => {
  // PostgreSQL duplicate key error code is '23505'
  if (err.code === '23505') {
    // Extract field name from error message
    let field = 'field';
    let message = 'Duplicate entry found';

    // Try to extract the constraint name from error detail
    if (err.detail) {
      if (err.detail.includes('email')) {
        field = 'email';
        message = 'Email address is already registered';
      } else if (err.detail.includes('username')) {
        field = 'username';
        message = 'Username is already taken';
      } else if (err.detail.includes('phone')) {
        field = 'phone';
        message = 'Phone number is already registered';
      }
    }

    return res.status(409).json({
      success: false,
      error: message,
      field: field
    });
  }

  // If not a duplicate key error, pass to next error handler
  next(err);
};

module.exports = { handleDuplicateKeyError };
