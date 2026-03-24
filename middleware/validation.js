const { body, validationResult } = require('express-validator');

// Validation middleware factory
const getValidationMiddleware = (type) => {
  let validations = [];

  switch (type) {
    case 'register':
      validations = [
        body('email')
          .isEmail()
          .withMessage('Please provide a valid email address')
          .normalizeEmail(),
        body('password')
          .isLength({ min: 6 })
          .withMessage('Password must be at least 6 characters long'),
        body('userType')
          .isIn(['traveler', 'service_provider'])
          .withMessage('User type must be either traveler or service_provider'),
        body('fullName')
          .optional()
          .trim()
          .isLength({ min: 2 })
          .withMessage('Full name must be at least 2 characters long'),
        body('businessName')
          .if(body('userType').equals('service_provider'))
          .optional()
          .trim()
          .isLength({ min: 2 })
          .withMessage('Business name must be at least 2 characters long'),
        body('companyName')
          .if(body('userType').equals('service_provider'))
          .optional()
          .trim()
          .isLength({ min: 2 })
          .withMessage('Company name must be at least 2 characters long'),
        // At least one of businessName or companyName must be provided for service providers
        body('userType')
          .if(body('userType').equals('service_provider'))
          .custom((value, { req }) => {
            if (!req.body.businessName && !req.body.companyName) {
              throw new Error('Business name or company name is required for service providers');
            }
            return true;
          })
      ];
      break;

    case 'login':
      validations = [
        body('email')
          .isEmail()
          .withMessage('Please provide a valid email address')
          .normalizeEmail(),
        body('password')
          .notEmpty()
          .withMessage('Password is required')
      ];
      break;

    default:
      validations = [];
  }

  // Return middleware array with validation rules and error handler
  return [
    ...validations,
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array().map(err => ({
            field: err.path,
            message: err.msg
          }))
        });
      }
      next();
    }
  ];
};

module.exports = { getValidationMiddleware };
